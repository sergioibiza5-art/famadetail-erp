import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft, CalendarDays, WalletCards } from "lucide-react"
import { PaymentMethod, WorkerAccount } from "@prisma/client"
import { requireAdmin } from "@/lib/auth"
import { accountLabel, formatMoney, roundMoney } from "@/lib/finance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{ account?: string }>
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function methodLabel(method: PaymentMethod | null) {
  if (method === "CASH") return "Numerário"
  if (method === "MBWAY") return "MB Way"
  return "Sem método"
}

export default async function PaymentMovementsPage({ searchParams }: Props) {
  await requireAdmin()

  const params = await searchParams
  const accountParam = String(params?.account || "").toUpperCase()
  const account = Object.values(WorkerAccount).includes(accountParam as WorkerAccount)
    ? (accountParam as WorkerAccount)
    : null

  const movements = await prisma.paymentMovement.findMany({
    where: account ? { account } : undefined,
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
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { paidAt: "desc" },
  })

  const total = movements.reduce((sum, movement) => roundMoney(sum + movement.amount), 0)

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
            Movimentos pagos
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Extrato do que foi pago a cada conta e a que ordem de serviço diz respeito.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {formatMoney(total)} pago
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href="/financeiro/movimentos" active={!account}>
          Todos
        </FilterLink>
        {Object.values(WorkerAccount).map((item) => (
          <FilterLink
            key={item}
            href={`/financeiro/movimentos?account=${item}`}
            active={account === item}
          >
            {accountLabel(item)}
          </FilterLink>
        ))}
      </div>

      <div className="space-y-4">
        {movements.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-8 text-center text-sm text-zinc-500">
            Ainda não existem movimentos pagos.
          </div>
        ) : (
          movements.map((movement) => {
            const allocatedTotal = movement.allocations.reduce(
              (sum, allocation) => roundMoney(sum + allocation.amount),
              0
            )
            const unallocatedAmount = roundMoney(movement.amount - allocatedTotal)

            return (
              <div
                key={movement.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]"
              >
                <div className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
                    <WalletCards className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">
                      {accountLabel(movement.account)} · {movement.notes || "Pagamento"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {methodLabel(movement.method)} · {formatDate(movement.paidAt)}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-emerald-300">
                    {formatMoney(movement.amount)}
                  </p>
                </div>

                <div className="divide-y divide-white/10">
                  {movement.allocations.length === 0 && unallocatedAmount <= 0 ? (
                    <div className="p-4 text-sm text-zinc-500">
                      Movimento antigo sem distribuição por serviço guardada.
                    </div>
                  ) : (
                    <>
                      {movement.allocations.map((allocation) => {
                        const split = allocation.financialSplit
                        const appointment = split.appointment

                        return (
                          <Link
                            key={allocation.id}
                            href={`/agenda/${appointment.id}`}
                            className="grid gap-3 p-4 transition hover:bg-white/[0.03] lg:grid-cols-[160px_1fr_120px_130px] lg:items-center"
                          >
                            <div>
                              <p className="text-xs uppercase tracking-wider text-zinc-500">
                                Ordem
                              </p>
                              <p className="mt-1 font-semibold text-white">
                                {appointment.orderNumber || "Sem OS"}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-white">
                                {appointment.serviceTemplate?.name || appointment.title}
                              </p>
                              <p className="mt-1 text-sm text-zinc-400">
                                {appointment.customer.name} · {appointment.vehicle.plate}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-zinc-400">
                              <CalendarDays className="h-4 w-4" />
                              {formatDate(appointment.date)}
                            </div>
                            <div className="text-sm">
                              <p className="text-zinc-500">Pago neste movimento</p>
                              <p className="font-semibold text-emerald-300">
                                {formatMoney(allocation.amount)}
                              </p>
                            </div>
                          </Link>
                        )
                      })}

                      {unallocatedAmount > 0 && (
                        <div className="grid gap-3 bg-emerald-500/[0.04] p-4 lg:grid-cols-[160px_1fr_120px_130px] lg:items-center">
                          <div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">
                              Saldo
                            </p>
                            <p className="mt-1 font-semibold text-emerald-200">
                              Pago a mais
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-white">
                              Saldo a favor de {accountLabel(movement.account)}
                            </p>
                            <p className="mt-1 text-sm text-zinc-400">
                              Valor pago acima dos serviços em falta neste movimento.
                            </p>
                          </div>
                          <div className="text-sm text-zinc-500">-</div>
                          <div className="text-sm">
                            <p className="text-zinc-500">Excedente</p>
                            <p className="font-semibold text-emerald-300">
                              {formatMoney(unallocatedAmount)}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function FilterLink({
  active,
  children,
  href,
}: {
  active: boolean
  children: ReactNode
  href: string
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-red-300/30 bg-red-500/15 text-red-100"
          : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
      }`}
    >
      {children}
    </Link>
  )
}