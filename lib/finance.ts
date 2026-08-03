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

  let remainingPaid = splits.reduce(
    (sum, split) => roundMoney(sum + getPaidAmount(split)),
    0
  )

  for (const [index, split] of splits.entries()) {
    const isLastSplit = index === splits.length - 1
    const nextPaidAmount = roundMoney(
      isLastSplit ? remainingPaid : Math.min(remainingPaid, split.amount)
    )
    const nextIsPaid = isMoneyPaid(nextPaidAmount, split.amount)
    remainingPaid = roundMoney(Math.max(0, remainingPaid - nextPaidAmount))

    if (
      Math.abs(getPaidAmount(split) - nextPaidAmount) > 0.001 ||
      split.isPaid !== nextIsPaid
    ) {
      await prisma.financialSplit.update({
        where: { id: split.id },
        data: {
          paidAmount: nextPaidAmount,
          isPaid: nextIsPaid,
          paidAt: nextIsPaid && split.amount > 0 ? split.paidAt ?? new Date() : null,
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
      ? roundMoney(parsedAmount)
      : 0

  remainingPayment = roundMoney(remainingPayment)

  if (remainingPayment <= 0) return

  const paidAt = paidAtValue ? new Date(paidAtValue) : new Date()
  const safePaidAt = Number.isNaN(paidAt.getTime()) ? new Date() : paidAt

  const paymentMovement = await prisma.paymentMovement.create({
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

    await prisma.paymentAllocation.create({
      data: {
        paymentMovementId: paymentMovement.id,
        financialSplitId: split.id,
        amount: roundMoney(amountToApply),
      },
    })

    remainingPayment = roundMoney(remainingPayment - amountToApply)
  }

  if (remainingPayment > 0 && splits.length > 0) {
    const split = splits[splits.length - 1]
    const paidAmount = getPaidAmount(split)
    const nextPaidAmount = roundMoney(paidAmount + remainingPayment)

    await prisma.financialSplit.update({
      where: { id: split.id },
      data: {
        paidAmount: nextPaidAmount,
        isPaid: isMoneyPaid(nextPaidAmount, split.amount),
        paidAt: safePaidAt,
      },
    })
  }

  await redistributeAccountCredit(account)
}