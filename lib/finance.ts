import { WorkerAccount } from "@prisma/client"
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
  return split.paidAmount || (split.isPaid ? split.amount : 0)
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
  const missing = Math.max(0, split.amount - paid)
  const credit = Math.max(0, paid - split.amount)

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
  let lastSplitId: string | null = null
  let lastSplitPaidAmount = 0

  for (const split of splits) {
    lastSplitId = split.id

    const currentPaid = getPaidAmount(split) + carry
    const nextPaidAmount = Math.min(currentPaid, split.amount)
    carry = Math.max(0, currentPaid - split.amount)
    lastSplitPaidAmount = nextPaidAmount

    if (
      Math.abs(getPaidAmount(split) - nextPaidAmount) > 0.001 ||
      split.isPaid !== (nextPaidAmount >= split.amount)
    ) {
      await prisma.financialSplit.update({
        where: { id: split.id },
        data: {
          paidAmount: nextPaidAmount,
          isPaid: nextPaidAmount >= split.amount,
          paidAt: nextPaidAmount >= split.amount && split.amount > 0 ? new Date() : null,
        },
      })
    }
  }

  if (carry > 0 && lastSplitId) {
    const nextPaidAmount = lastSplitPaidAmount + carry

    await prisma.financialSplit.update({
      where: { id: lastSplitId },
      data: {
        paidAmount: nextPaidAmount,
        isPaid: true,
        paidAt: new Date(),
      },
    })
  }
}

export async function payWorkerAccount({
  account,
  amountValue,
  payAll,
}: {
  account: WorkerAccount
  amountValue: string
  payAll: boolean
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
    return sum + Math.max(0, split.amount - paidAmount)
  }, 0)

  const parsedAmount = amountValue ? Number(amountValue.replace(",", ".")) : 0
  let remainingPayment = payAll
    ? pendingTotal
    : Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount
      : 0

  if (remainingPayment <= 0) return

  for (const split of splits) {
    if (remainingPayment <= 0) break

    const paidAmount = getPaidAmount(split)
    const missingAmount = Math.max(0, split.amount - paidAmount)

    if (missingAmount <= 0) continue

    const amountToApply = Math.min(missingAmount, remainingPayment)
    const nextPaidAmount = paidAmount + amountToApply

    await prisma.financialSplit.update({
      where: { id: split.id },
      data: {
        paidAmount: nextPaidAmount,
        isPaid: nextPaidAmount >= split.amount,
        paidAt: nextPaidAmount >= split.amount ? new Date() : null,
      },
    })

    remainingPayment -= amountToApply
  }

  if (remainingPayment > 0 && splits.length > 0) {
    const targetSplit = splits[splits.length - 1]
    const paidAmount = getPaidAmount(targetSplit)
    const nextPaidAmount = paidAmount + remainingPayment

    await prisma.financialSplit.update({
      where: { id: targetSplit.id },
      data: {
        paidAmount: nextPaidAmount,
        isPaid: true,
        paidAt: new Date(),
      },
    })
  }

  await redistributeAccountCredit(account)
}
