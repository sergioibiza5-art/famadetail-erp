import { WorkerAccount } from "@prisma/client"

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
