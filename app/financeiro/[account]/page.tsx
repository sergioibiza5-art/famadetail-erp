import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { WorkerAccount } from "@prisma/client"
import { ArrowLeft, CalendarDays, Euro, User, WalletCards } from "lucide-react"
import {
  accountLabel,
  formatMoney,
  getPaidAmount,
  getPaymentState,
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

  const account = String(formData.get("account") || "") as WorkerAccount
  const amountValue = String(formData.get("amount") || "").replace(",", ".")
  const payAll = String(formData.get("payAll") || "") === "on"

  if (!Object.values(WorkerAccount).includes(account)) return

  const splits = await prisma.financialSplit.findMany({
    where: { account },
    include: {
      appointment: {
        select: {
          date: true,
        },
      },
    },
    orderBy: {
      appointment: {
        date: "asc",
      },
    },
  })

  const pendingTotal = splits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return sum + Math.max(0, split.amount - paidAmount)
  }, 0)

  const parsedAmount = amountValue ? Number(amountValue) : 0
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

  revalidatePath("/financeiro")
  revalidatePath(`/financeiro/${account}`)
  revalidatePath("/dashboard")
  revalidatePath("/agenda")
}

export default async function FinanceAccountPage({ params }: Props) {
  const { account: accountParam } = await params
  const account = accountParam.toUpperCase() as WorkerAccount

  if (!Object.values(WorkerAccount).includes(account)) notFound()

  const splits = await prisma.financialSplit.findMany({
    where: { account },
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

  const total = splits.reduce((sum, split) => sum + split.amount, 0)
  const paid = splits.reduce((sum, split) => sum + getPaidAmount(split), 0)
  const pending = splits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return sum + Math.max(0, split.amount - paidAmount)
  }, 0)
  const credit = splits.reduce((sum, split) => {
    const paidAmount = getPaidAmount(split)
    return sum + Math.max(0, paidAmount - split.amount)
  }, 0)
  const paidServices = splits.filter((split) => getPaidAmount(split) >= split.amount)
  const pendingServices = splits.filter((split) => getPaidAmount(split) < split.amount)

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
        className="mb-4 grid gap-3 rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
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
        <button className="min-h-12 rounded-2xl bg-red-500 px-5 py-3 text-sm font-black text-white transition hover:bg-red-400">
          Guardar pagamento
        </button>
      </form>

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
              const missing = Math.max(0, split.amount - paidAmount)
              const extra = Math.max(0, paidAmount - split.amount)
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
