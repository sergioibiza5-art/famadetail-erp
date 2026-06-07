import Link from "next/link"
import { revalidatePath } from "next/cache"
import { CheckCircle, CreditCard, Euro, User, WalletCards } from "lucide-react"
import { WorkerAccount } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
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

async function updateSplitPayment(formData: FormData) {
  "use server"

  const id = String(formData.get("id") || "")
  const isPaid = String(formData.get("isPaid") || "") === "on"

  if (!id) return

  const split = await prisma.financialSplit.update({
    where: { id },
    data: {
      isPaid,
      paidAt: isPaid ? new Date() : null,
    },
    select: {
      appointmentId: true,
    },
  })

  revalidatePath("/financeiro")
  revalidatePath("/dashboard")
  revalidatePath("/agenda")
  revalidatePath(`/agenda/${split.appointmentId}`)
}

export default async function FinancePage() {
  const [splits, appointmentsWithoutSplits] = await Promise.all([
    prisma.financialSplit.findMany({
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
    prisma.appointment.findMany({
      where: {
        status: {
          notIn: ["CANCELLED"],
        },
        financialSplits: {
          none: {},
        },
      },
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
      orderBy: {
        date: "desc",
      },
      take: 8,
    }),
  ])

  const totals = Object.values(WorkerAccount).map((account) => {
    const accountSplits = splits.filter((split) => split.account === account)
    const total = accountSplits.reduce((sum, split) => sum + split.amount, 0)
    const paid = accountSplits
      .filter((split) => split.isPaid)
      .reduce((sum, split) => sum + split.amount, 0)
    const pending = total - paid

    return {
      account,
      total,
      paid,
      pending,
    }
  })

  const pendingSplits = splits.filter((split) => !split.isPaid)
  const paidSplits = splits.filter((split) => split.isPaid)

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Financeiro
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Contas dos servicos
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Controla a divisao entre Sérgio, Adriana e FamaDetail.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {pendingSplits.length} pendente(s)
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {totals.map((item) => (
          <div
            key={item.account}
            className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-400">{accountLabel(item.account)}</p>
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
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Valores pendentes</h2>
            <p className="text-sm text-zinc-400">
              Marca cada conta quando o valor for entregue.
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {pendingSplits.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">
                Nenhum valor pendente.
              </p>
            ) : (
              pendingSplits.map((split) => (
                <FinancialSplitRow
                  key={split.id}
                  split={split}
                  updateSplitPayment={updateSplitPayment}
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Por configurar</h2>
              <p className="text-sm text-zinc-400">
                Agendamentos sem trabalhadores definidos.
              </p>
            </div>

            <div className="divide-y divide-white/10">
              {appointmentsWithoutSplits.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Tudo configurado.
                </p>
              ) : (
                appointmentsWithoutSplits.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/agenda/${appointment.id}`}
                    className="block p-4 transition hover:bg-white/5"
                  >
                    <p className="font-semibold text-white">{appointment.title}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {appointment.customer.name} - {appointment.vehicle.brand}{" "}
                      {appointment.vehicle.model}
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {formatDate(appointment.date)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Pagos recentes</h2>
              <p className="text-sm text-zinc-400">Ultimas parcelas liquidadas.</p>
            </div>

            <div className="divide-y divide-white/10">
              {paidSplits.slice(0, 6).length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Nenhum pagamento registado.
                </p>
              ) : (
                paidSplits.slice(0, 6).map((split) => (
                  <FinancialSplitRow
                    key={split.id}
                    split={split}
                    updateSplitPayment={updateSplitPayment}
                    compact
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

type SplitWithAppointment = Awaited<
  ReturnType<typeof prisma.financialSplit.findMany>
>[number] & {
  appointment: {
    id: string
    title: string
    date: Date
    customer: { name: string }
    vehicle: { brand: string; model: string }
    serviceTemplate: { price: number } | null
  }
}

function FinancialSplitRow({
  split,
  updateSplitPayment,
  compact = false,
}: {
  split: SplitWithAppointment
  updateSplitPayment: (formData: FormData) => Promise<void>
  compact?: boolean
}) {
  return (
    <div
      className={`grid gap-3 p-4 ${
        compact ? "" : "sm:grid-cols-[1fr_130px_150px] sm:items-center"
      }`}
    >
      <Link href={`/agenda/${split.appointment.id}`} className="min-w-0">
        <p className="truncate font-semibold text-white">
          {accountLabel(split.account)} - {split.appointment.title}
        </p>
        <p className="mt-1 truncate text-sm text-zinc-400">
          {split.appointment.customer.name} - {split.appointment.vehicle.brand}{" "}
          {split.appointment.vehicle.model}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {formatDate(split.appointment.date)}
        </p>
      </Link>

      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Euro className="h-4 w-4 text-red-300" />
        {formatMoney(split.amount)}
      </div>

      <form action={updateSplitPayment}>
        <input type="hidden" name="id" value={split.id} />
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          <span className="inline-flex items-center gap-2">
            {split.isPaid ? (
              <CheckCircle className="h-4 w-4 text-emerald-300" />
            ) : (
              <CreditCard className="h-4 w-4 text-zinc-400" />
            )}
            Pago
          </span>
          <input
            name="isPaid"
            type="checkbox"
            defaultChecked={split.isPaid}
            className="h-4 w-4 accent-red-300"
          />
        </label>
        <button className="mt-2 w-full rounded-xl bg-zinc-100 px-3 py-2 text-xs font-black text-black transition hover:bg-white">
          Guardar
        </button>
      </form>
    </div>
  )
}
