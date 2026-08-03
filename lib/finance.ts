import { PaymentMethod, WorkerAccount } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export function accountLabel(account: WorkerAccount) {
  switch (account) {
    case "JOAO":
      return "Sérgio"
    case "ADRIANA":
      return "Adriana"
    case "FAMADETAIL":
      return "FamaDetail"
    default:
      return account
  }
}

export function getPaidAmount(split: {
  paidAmount: number
  isPaid: boolean
  amount: number
}) {
  return roundMoney(split.paidAmount || (split.isPaid ? split.amount : 0))
}

export function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function isMoneyPaid(paid: number, amount: number) {
  return roundMoney(paid) >= roundMoney(amount)
}

export function missingMoney(amount: number, paid: number) {
  return roundMoney(Math.max(0, roundMoney(amount) - roundMoney(paid)))
}

export function creditMoney(paid: number, amount: number) {
  return roundMoney(Math.max(0, roundMoney(paid) - roundMoney(amount)))
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0)
}

export function getPaymentState(split: {
  paidAmount: number
  isPaid: boolean
  amount: number
}) {
  const paid = getPaidAmount(split)
  const missing = missingMoney(split.amount, paid)
  const credit = creditMoney(paid, split.amount)

  if (credit > 0) return "Saldo"
  if (missing <= 0) return "Pago"
  if (paid > 0) return "Parcial"
  return "Por pagar"
}

export async function redistributeAccountCredit(account: WorkerAccount) {
  const splits = await prisma.financialSplit.findMany({
    where: { account },
    include: {
      appointment: {
        select: {
          date: true,
        },
      },
    },
    orderBy: [
      {
        appointment: {
          date: "asc",
        },
      },
      {
        createdAt: "asc",
      },
    ],
  })

  let carry = 0

  for (const split of splits) {
    const currentPaid = roundMoney(getPaidAmount(split) + carry)
    const nextPaidAmount = roundMoney(Math.min(currentPaid, split.amount))
    carry = creditMoney(currentPaid, split.amount)

    if (
      Math.abs(getPaidAmount(split) - nextPaidAmount) > 0.001 ||
      split.isPaid !== isMoneyPaid(nextPaidAmount, split.amount)
    ) {
      await prisma.financialSplit.update({
        where: { id: split.id },
        data: {
          paidAmount: nextPaidAmount,
          isPaid: isMoneyPaid(nextPaidAmount, split.amount),
          paidAt: isMoneyPaid(nextPaidAmount, split.amount) && split.amount > 0 ? new Date() : null,
        },
      })
    }
  }
}

export async function payWorkerAccount({
  account,
  amountValue,
  payAll,
  method,
  notes,
  paidAtValue,
}: {
  account: WorkerAccount
  amountValue: string
  payAll: boolean
  method?: PaymentMethod | null
  notes?: string
  paidAtValue?: string
}) {
  await redistributeAccountCredit(account)

  const splits = await prisma.financialSplit.findMany({
    where: { account },
    include: {
      appointment: {
        select: {
          date: true,
        },
      },
    },
    orderBy: [
      {
        appointment: {
          date: "asc",
        },
      },
      {
        createdAt: "asc",
      },
    ],
  })

  const pendingTotal = splits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return roundMoney(sum + missingMoney(split.amount, paidAmount))
  }, 0)

  const parsedAmount = amountValue ? Number(amountValue.replace(",", ".")) : 0
  let remainingPayment = payAll
    ? pendingTotal
    : Number.isFinite(parsedAmount) && parsedAmount > 0
      ? Math.min(roundMoney(parsedAmount), pendingTotal)
      : 0

  remainingPayment = roundMoney(remainingPayment)

  if (remainingPayment <= 0) return

  const paidAt = paidAtValue ? new Date(paidAtValue) : new Date()
  const safePaidAt = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt

  await prisma.paymentMovement.create({
    data: {
      account,
      amount: remainingPayment,
      method,
      notes: notes?.trim() || (payAll ? "Pagamento total em falta" : "Pagamento manual"),
      paidAt: safePaidAt,
    },
  })

  for (const split of splits) {
    if (remainingPayment <= 0) break

    const paidAmount = getPaidAmount(split)
    const missingAmount = missingMoney(split.amount, paidAmount)

    if (missingAmount <= 0) continue

    const amountToApply = Math.min(missingAmount, remainingPayment)
    const nextPaidAmount = roundMoney(paidAmount + amountToApply)

    await prisma.financialSplit.update({
      where: { id: split.id },
      data: {
        paidAmount: nextPaidAmount,
        isPaid: isMoneyPaid(nextPaidAmount, split.amount),
        paidAt: isMoneyPaid(nextPaidAmount, split.amount) ? safePaidAt : null,
      },
    })

    remainingPayment = roundMoney(remainingPayment - amountToApply)
  }

  await redistributeAccountCredit(account)
}
