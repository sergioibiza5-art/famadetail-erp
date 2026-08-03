import Link from "next/link"
import { revalidatePath } from "next/cache"
import { CalendarDays, Download, Euro, User, WalletCards } from "lucide-react"
import { PaymentMethod, WorkerAccount } from "@prisma/client"
import { requireAdmin } from "@/lib/auth"
import {
  creditMoney,
  getPaidAmount,
  isMoneyPaid,
  missingMoney,
  payWorkerAccount,
  roundMoney,
} from "@/lib/finance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0)
}

function accountLabel(account: WorkerAccount) {
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

async function payAccount(formData: FormData) {
  "use server"

  await requireAdmin()

  const account = String(formData.get("account") || "") as WorkerAccount
  const amountValue = String(formData.get("amount") || "")
  const payAll = String(formData.get("payAll") || "") === "on"
  const methodValue = String(formData.get("method") || "")
  const notes = String(formData.get("notes") || "").trim()
  const paidAtValue = String(formData.get("paidAt") || "")
  const method = Object.values(PaymentMethod).includes(methodValue as PaymentMethod)
    ? (methodValue as PaymentMethod)
    : null

  if (!Object.values(WorkerAccount).includes(account)) return

  await payWorkerAccount({ account, amountValue, payAll, method, notes, paidAtValue })

  revalidatePath("/financeiro")
  revalidatePath("/dashboard")
  revalidatePath("/agenda")
}

export default async function FinancePage() {
  const splits = await prisma.financialSplit.findMany({
    where: {
      OR: [
        {
          amount: {
            gt: 0,
          },
        },
        {
          paidAmount: {
            gt: 0,
          },
        },
      ],
    },
    include: {
      appointment: {
        include: {
          customer: true,
          vehicle: true,
          serviceTemplate: true,
        },
      },
    },
    orderBy: {
      appointment: {
        date: "desc",
      },
    },
  })

  const totals = Object.values(WorkerAccount).map((account) => {
    const accountSplits = splits.filter((split) => split.account === account)
    const total = accountSplits.reduce((sum, split) => roundMoney(sum + split.amount), 0)
    const paid = accountSplits.reduce(
      (sum, split) =>
        roundMoney(sum + getPaidAmount(split)),
      0
    )
    const pending = accountSplits.reduce((sum, split) => {
      const paidAmount = getPaidAmount(split)
      return roundMoney(sum + missingMoney(split.amount, paidAmount))
    }, 0)
    const credit = accountSplits.reduce((sum, split) => {
      const paidAmount = getPaidAmount(split)
      return roundMoney(sum + creditMoney(paidAmount, split.amount))
    }, 0)

    return {
      account,
      total,
      paid,
      pending,
      credit,
    }
  })

  const pendingSplits = splits.filter((split) => {
    const paidAmount = getPaidAmount(split)
    return !isMoneyPaid(paidAmount, split.amount)
  })
  const completedServiceIds = new Set(splits.map((split) => split.appointmentId))
  const totalToReceive = pendingSplits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return roundMoney(sum + missingMoney(split.amount, paidAmount))
  }, 0)
  const totalReceived = splits.reduce(
    (sum, split) =>
      roundMoney(sum + getPaidAmount(split)),
    0
  )
  const totalCredit = splits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return roundMoney(sum + creditMoney(paidAmount, split.amount))
  }, 0)
  const totalGenerated = splits.reduce((sum, split) => roundMoney(sum + split.amount), 0)

  const summaryCards = [
    {
      label: "Serviços feitos",
      value: String(completedServiceIds.size),
      detail: `${splits.length} parcela(s) financeiras`,
      icon: CalendarDays,
    },
    {
      label: "Total gerado",
      value: formatMoney(totalGenerated),
      detail: "Valor total dividido",
      icon: Euro,
    },
    {
      label: "Recebido",
      value: formatMoney(totalReceived),
      detail: "Pagamentos registados",
      icon: WalletCards,
    },
    {
      label: "A receber",
      value: formatMoney(totalToReceive),
      detail: totalCredit > 0 ? `${formatMoney(totalCredit)} em saldo` : "Sem saldo extra",
      icon: Euro,
    },
  ]

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Financeiro
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Contas dos serviços
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Controla a divisao entre Sérgio, Adriana e FamaDetail.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/api/financeiro/export"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Link>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
            {formatMoney(totalToReceive)} a receber
          </div>
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <div
              key={card.label}
              className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-400">{card.label}</p>
                  <p className="mt-1 text-xs text-zinc-600">{card.detail}</p>
                </div>
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {totals.map((item) => (
          <div
            key={item.account}
            className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Link
                  href={`/financeiro/${item.account}`}
                  className="text-sm font-semibold text-zinc-200 underline-offset-4 transition hover:text-red-200 hover:underline"
                >
                  {accountLabel(item.account)}
                </Link>
                <p className="mt-1 text-xs text-zinc-600">
                  {formatMoney(item.paid)} pago
                </p>
              </div>
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                {item.account === "FAMADETAIL" ? (
                  <WalletCards className="h-5 w-5" />
                ) : (
                  <User className="h-5 w-5" />
                )}
              </div>
            </div>

            <p className="text-2xl font-bold text-white">
              {formatMoney(item.pending)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">por pagar</p>
            {item.credit > 0 && (
              <p className="mt-2 text-xs font-semibold text-emerald-300">
                {formatMoney(item.credit)} em saldo
              </p>
            )}

            <form action={payAccount} className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <input type="hidden" name="account" value={item.account} />
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Pagar agora
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
                />
              </label>
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white">
                Pagar tudo em falta
                <input name="payAll" type="checkbox" className="h-4 w-4 accent-red-300" />
              </label>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Método
                  <select
                    name="method"
                    defaultValue=""
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-300/60"
                  >
                    <option value="">Sem método</option>
                    <option value="CASH">Numerário</option>
                    <option value="MBWAY">MB Way</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Data
                  <input
                    name="paidAt"
                    type="date"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-300/60"
                  />
                </label>
              </div>
              <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Nota
                <input
                  name="notes"
                  placeholder="Ex: acerto semanal"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
                />
              </label>
              <button className="mt-3 w-full rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white transition hover:bg-red-400">
                Guardar pagamento
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  )
}
