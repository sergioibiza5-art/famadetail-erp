import Link from "next/link"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { CalendarDays, CheckCircle, Download, Euro, ListChecks, User, WalletCards } from "lucide-react"
import { PaymentMethod, WorkerAccount } from "@prisma/client"
import { requireAdmin } from "@/lib/auth"
import {
  FINANCE_MOVEMENT_IGNORE_UNTIL_LABEL,
  accountLabel,
  activeFinancialSplitWhere,
  activePaymentMovementWhere,
  payWorkerAccount,
  roundMoney,
} from "@/lib/finance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type FinancePageProps = {
  searchParams?: Promise<{
    saved?: string
  }>
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0)
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
  revalidatePath("/financeiro/movimentos")
  revalidatePath(`/financeiro/${account}`)
  revalidatePath("/dashboard")
  revalidatePath("/agenda")

  redirect("/financeiro?saved=payment")
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const params = await searchParams
  const [splits, paymentMovements] = await Promise.all([
    prisma.financialSplit.findMany({
      where: {
        ...activeFinancialSplitWhere(),
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
    }),
    prisma.paymentMovement.findMany({
      where: activePaymentMovementWhere(),
    }),
  ])

  const totals = Object.values(WorkerAccount).map((account) => {
    const accountSplits = splits.filter((split) => split.account === account)
    const accountMovements = paymentMovements.filter((movement) => movement.account === account)
    const total = accountSplits.reduce((sum, split) => roundMoney(sum + split.amount), 0)
    const paid = accountMovements.reduce((sum, movement) => roundMoney(sum + movement.amount), 0)
    const pending = roundMoney(Math.max(0, total - paid))
    const credit = roundMoney(Math.max(0, paid - total))

    return {
      account,
      total,
      paid,
      pending,
      credit,
    }
  })

  const completedServiceIds = new Set(splits.map((split) => split.appointmentId))
  const totalGenerated = splits.reduce((sum, split) => roundMoney(sum + split.amount), 0)
  const totalPaidToAccounts = paymentMovements.reduce(
    (sum, movement) => roundMoney(sum + movement.amount),
    0
  )
  const totalPending = totals.reduce((sum, item) => roundMoney(sum + item.pending), 0)
  const totalCredit = totals.reduce((sum, item) => roundMoney(sum + item.credit), 0)
  const netBalance = roundMoney(Math.max(0, totalPending - totalCredit))
  const openServiceMap = new Map<
    string,
    {
      customerName: string
      missing: number
      orderNumber: string | null
      paid: number
      serviceName: string
      total: number
      vehiclePlate: string | null
    }
  >()

  for (const split of splits) {
    const paid = Math.min(split.paidAmount || 0, split.amount)
    const current = openServiceMap.get(split.appointmentId) || {
      customerName: split.appointment.customer.name,
      missing: 0,
      orderNumber: split.appointment.orderNumber,
      paid: 0,
      serviceName: split.appointment.serviceTemplate?.name || split.appointment.title,
      total: 0,
      vehiclePlate: split.appointment.vehicle.plate,
    }

    current.total = roundMoney(current.total + split.amount)
    current.paid = roundMoney(current.paid + paid)
    current.missing = roundMoney(current.missing + Math.max(0, split.amount - paid))
    openServiceMap.set(split.appointmentId, current)
  }

  const openServices = [...openServiceMap.values()].filter((item) => item.missing > 0)
  const openServicesTotal = openServices.reduce(
    (sum, item) => roundMoney(sum + item.total),
    0
  )
  const openServicesPaid = openServices.reduce(
    (sum, item) => roundMoney(sum + item.paid),
    0
  )

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
      label: "Pago às contas",
      value: formatMoney(totalPaidToAccounts),
      detail: "Pagamentos registados",
      icon: WalletCards,
    },
    {
      label: "Por pagar",
      value: formatMoney(totalPending),
      detail:
        totalCredit > 0
          ? `${formatMoney(totalCredit)} em saldo a favor`
          : "Sem saldos a favor",
      icon: Euro,
    },
    {
      label: "Saldo líquido",
      value: formatMoney(netBalance),
      detail: "Por pagar depois dos saldos",
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
            Controla a divisão entre Sérgio, Adriana e FamaDetail.
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
          <Link
            href="/financeiro/movimentos"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
          >
            <ListChecks className="h-4 w-4" />
            Movimentos
          </Link>
          <Link
            href="/financeiro/acertos"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
          >
            <WalletCards className="h-4 w-4" />
            Acertos
          </Link>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
            {formatMoney(totalPending)} por pagar
          </div>
        </div>
      </div>

      {totalCredit > 0 && (
        <div className="mb-4 rounded-3xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          <p className="font-semibold">Leitura das contas</p>
          <p className="mt-1 text-sky-100/80">
            Há {formatMoney(totalPending)} por pagar às contas e{" "}
            {formatMoney(totalCredit)} em saldos a favor. O saldo líquido é{" "}
            {formatMoney(netBalance)}, mas os cartões por conta mostram sempre a
            dívida real de cada conta em separado.
          </p>
        </div>
      )}

      <div className="mb-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
        Movimentos até {FINANCE_MOVEMENT_IGNORE_UNTIL_LABEL} estão guardados como
        histórico, mas não entram nestas contas.
      </div>

      {openServices.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-3xl border border-amber-400/20 bg-amber-500/5">
          <div className="border-b border-amber-400/20 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">
              Porque aparece {formatMoney(totalPending)}?
            </h2>
            <p className="text-sm text-zinc-400">
              O valor em falta e calculado pelas parcelas das contas, nao pelo
              preco cheio do servico.
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm text-zinc-400">Servicos em aberto</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {formatMoney(openServicesTotal)}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-100/70">Ja abatido as contas</p>
              <p className="mt-2 text-2xl font-bold text-emerald-100">
                {formatMoney(openServicesPaid)}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-100/70">Falta pagar as contas</p>
              <p className="mt-2 text-2xl font-bold text-amber-100">
                {formatMoney(totalPending)}
              </p>
            </div>
          </div>
          <div className="divide-y divide-amber-400/10">
            {openServices.map((item) => (
              <div
                key={item.orderNumber || item.serviceName}
                className="grid gap-3 p-4 text-sm lg:grid-cols-[150px_1fr_120px_120px_120px] lg:items-center"
              >
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">OS</p>
                  <p className="mt-1 font-semibold text-white">
                    {item.orderNumber || "Sem OS"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-white">{item.serviceName}</p>
                  <p className="mt-1 text-zinc-400">
                    {item.customerName} - {item.vehiclePlate || "Sem matricula"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Servico</p>
                  <p className="font-semibold text-white">{formatMoney(item.total)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Abatido</p>
                  <p className="font-semibold text-emerald-300">
                    {formatMoney(item.paid)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Falta</p>
                  <p className="font-semibold text-amber-100">
                    {formatMoney(item.missing)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {params?.saved && (
        <div className="mb-4 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-300" />
            <p className="font-semibold">Pagamento guardado e valores atualizados.</p>
          </div>
        </div>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
