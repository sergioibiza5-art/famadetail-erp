import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { PaymentMethod, WorkerAccount } from "@prisma/client"
import { ArrowLeft, CalendarDays, Download, Euro, User, WalletCards } from "lucide-react"
import { requireAdmin } from "@/lib/auth"
import {
  accountLabel,
  creditMoney,
  formatMoney,
  getPaidAmount,
  getPaymentState,
  isMoneyPaid,
  missingMoney,
  payWorkerAccount,
  roundMoney,
} from "@/lib/finance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ account: string }>
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
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
  revalidatePath(`/financeiro/${account}`)
  revalidatePath("/dashboard")
  revalidatePath("/agenda")
}

export default async function FinanceAccountPage({ params }: Props) {
  const { account: accountParam } = await params
  const account = accountParam.toUpperCase() as WorkerAccount

  if (!Object.values(WorkerAccount).includes(account)) notFound()

  const [splits, paymentMovements] = await Promise.all([
    prisma.financialSplit.findMany({
      where: {
        account,
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
      where: { account },
      include: {
        allocations: {
          include: {
            financialSplit: {
              include: {
                appointment: {
                  include: {
                    customer: true,
                    vehicle: true,
                    serviceTemplate: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 8,
    }),
  ])

  const total = splits.reduce((sum, split) => roundMoney(sum + split.amount), 0)
  const paid = splits.reduce((sum, split) => roundMoney(sum + getPaidAmount(split)), 0)
  const pending = splits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return roundMoney(sum + missingMoney(split.amount, paidAmount))
  }, 0)
  const credit = splits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return roundMoney(sum + creditMoney(paidAmount, split.amount))
  }, 0)
  const paidServices = splits.filter((split) => isMoneyPaid(getPaidAmount(split), split.amount))
  const pendingServices = splits.filter((split) => !isMoneyPaid(getPaidAmount(split), split.amount))

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <Link
        href="/financeiro"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao financeiro
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Financeiro
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {accountLabel(account)}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Serviços feitos, pagos e por pagar desta conta.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {formatMoney(pending)} por pagar
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Serviços",
            value: String(splits.length),
            detail: `${paidServices.length} pago(s), ${pendingServices.length} em aberto`,
            icon: CalendarDays,
          },
          {
            label: "Total",
            value: formatMoney(total),
            detail: "Valor atribuído",
            icon: Euro,
          },
          {
            label: "Pago",
            value: formatMoney(paid),
            detail: credit > 0 ? `${formatMoney(credit)} em saldo` : "Sem saldo extra",
            icon: WalletCards,
          },
          {
            label: "Por pagar",
            value: formatMoney(pending),
            detail: "Valor em falta",
            icon: User,
          },
        ].map((card) => {
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

      <form
        action={payAccount}
        className="mb-4 grid gap-3 rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 lg:grid-cols-[1fr_150px_150px_170px_auto] lg:items-end"
      >
        <input type="hidden" name="account" value={account} />
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Pagar agora
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
          />
        </label>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white">
          Pagar tudo em falta
          <input name="payAll" type="checkbox" className="h-4 w-4 accent-red-300" />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Método
          <select
            name="method"
            defaultValue=""
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
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
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 lg:col-span-3">
          Nota
          <input
            name="notes"
            placeholder="Ex: transferência semanal"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
          />
        </label>
        <button className="min-h-12 rounded-2xl bg-red-500 px-5 py-3 text-sm font-black text-white transition hover:bg-red-400">
          Guardar pagamento
        </button>
      </form>

      <div className="mb-4 flex justify-end">
        <Link
          href={`/api/financeiro/export?account=${account}`}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
        >
          <Download className="h-4 w-4" />
          Exportar CSV desta conta
        </Link>
        <Link
          href={`/financeiro/movimentos?account=${account}`}
          className="ml-2 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
        >
          <Download className="h-4 w-4" />
          Ver movimentos pagos
        </Link>
      </div>

      {paymentMovements.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Pagamentos registados</h2>
            <p className="text-sm text-zinc-400">
              Histórico dos últimos pagamentos desta conta.
            </p>
          </div>
          <div className="divide-y divide-white/10">
            {paymentMovements.map((movement) => (
              <div
                key={movement.id}
                className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
              >
                <div>
                  <p className="font-semibold text-white">
                    {movement.notes || "Pagamento"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {movement.allocations.length > 0
                      ? `${movement.allocations.length} serviço(s) associado(s)`
                      : "Movimento antigo sem serviços associados"}
                  </p>
                </div>
                <p className="font-semibold text-emerald-300">
                  {formatMoney(movement.amount)}
                </p>
                <p className="text-sm text-zinc-500">
                  {movement.method ? `${movement.method === "CASH" ? "Numerário" : "MB Way"} · ` : ""}
                  {formatDate(movement.paidAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
        <div className="border-b border-white/10 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Serviços desta conta</h2>
          <p className="text-sm text-zinc-400">
            Lista completa com estado financeiro de cada serviço.
          </p>
        </div>

        <div className="divide-y divide-white/10">
          {splits.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">
              Ainda não existem serviços nesta conta.
            </p>
          ) : (
            splits.map((split) => {
              const paidAmount = getPaidAmount(split)
              const missing = missingMoney(split.amount, paidAmount)
              const extra = creditMoney(paidAmount, split.amount)
              const state = getPaymentState(split)

              return (
                <Link
                  key={split.id}
                  href={`/agenda/${split.appointmentId}`}
                  className="grid gap-3 p-4 transition hover:bg-white/[0.03] lg:grid-cols-[1fr_120px_120px_120px_110px] lg:items-center"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {split.appointment.serviceTemplate?.name || split.appointment.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-red-200">
                      {split.appointment.orderNumber || "Sem OS"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {split.appointment.customer.name} · {split.appointment.vehicle.brand}{" "}
                      {split.appointment.vehicle.model}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatDate(split.appointment.date)} · {split.percentage.toFixed(2)}%
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-zinc-500">Valor</p>
                    <p className="font-semibold text-white">{formatMoney(split.amount)}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-zinc-500">Pago</p>
                    <p className="font-semibold text-white">{formatMoney(paidAmount)}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-zinc-500">{extra > 0 ? "Saldo" : "Falta"}</p>
                    <p className={extra > 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-200"}>
                      {formatMoney(extra > 0 ? extra : missing)}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
                      state === "Pago"
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                        : state === "Saldo"
                          ? "border-sky-400/20 bg-sky-500/10 text-sky-200"
                          : state === "Parcial"
                            ? "border-amber-400/20 bg-amber-500/10 text-amber-200"
                            : "border-red-400/20 bg-red-500/10 text-red-200"
                    }`}
                  >
                    {state}
                  </span>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}
