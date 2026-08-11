import Link from "next/link"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import type { ReactNode } from "react"
import { ArrowLeft, CalendarDays, WalletCards } from "lucide-react"
import { PaymentMethod, WorkerAccount } from "@prisma/client"
import { ConfirmSubmitButton } from "@/components/confirm-submit-button"
import { requireAdmin } from "@/lib/auth"
import {
  accountLabel,
  formatMoney,
  getPaidAmount,
  missingMoney,
  redistributeAccountCredit,
  roundMoney,
} from "@/lib/finance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{ account?: string; saved?: string }>
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

async function revalidateFinanceViews(account?: WorkerAccount | null) {
  revalidatePath("/financeiro")
  revalidatePath("/financeiro/movimentos")
  revalidatePath("/financeiro/acertos")
  revalidatePath("/dashboard")
  revalidatePath("/analytics")
  revalidatePath("/agenda")

  if (account) {
    revalidatePath(`/financeiro/${account}`)
  }
}

async function movePaymentMovement(formData: FormData) {
  "use server"

  await requireAdmin()

  const movementId = String(formData.get("movementId") || "")
  const targetAccount = String(formData.get("targetAccount") || "") as WorkerAccount
  const note = String(formData.get("correctionNote") || "").trim()

  if (!movementId || !Object.values(WorkerAccount).includes(targetAccount)) return

  const movement = await prisma.paymentMovement.findUnique({
    where: { id: movementId },
  })

  if (!movement || movement.amount <= 0 || movement.account === targetAccount) return

  const description =
    note || `Correção: movimento ${movement.id.slice(0, 8)} estava na conta errada`

  await prisma.$transaction([
    prisma.paymentMovement.create({
      data: {
        account: movement.account,
        amount: -movement.amount,
        method: movement.method,
        paidAt: new Date(),
        notes: `${description} · saída para ${accountLabel(targetAccount)}`,
      },
    }),
    prisma.paymentMovement.create({
      data: {
        account: targetAccount,
        amount: movement.amount,
        method: movement.method,
        paidAt: movement.paidAt,
        notes: `${description} · entrada de ${accountLabel(movement.account)}`,
      },
    }),
  ])

  await Promise.all([
    redistributeAccountCredit(movement.account),
    redistributeAccountCredit(targetAccount),
  ])

  await revalidateFinanceViews(movement.account)
  await revalidateFinanceViews(targetAccount)

  redirect(`/financeiro/movimentos?saved=moved&account=${targetAccount}`)
}

async function voidPaymentMovement(formData: FormData) {
  "use server"

  await requireAdmin()

  const movementId = String(formData.get("movementId") || "")
  const note = String(formData.get("correctionNote") || "").trim()

  if (!movementId) return

  const movement = await prisma.paymentMovement.findUnique({
    where: { id: movementId },
  })

  if (!movement || movement.amount <= 0) return

  await prisma.paymentMovement.create({
    data: {
      account: movement.account,
      amount: -movement.amount,
      method: movement.method,
      paidAt: new Date(),
      notes:
        note ||
        `Anulação: movimento ${movement.id.slice(0, 8)} lançado por engano`,
    },
  })

  await redistributeAccountCredit(movement.account)
  await revalidateFinanceViews(movement.account)

  redirect(`/financeiro/movimentos?saved=voided&account=${movement.account}`)
}

export default async function PaymentMovementsPage({ searchParams }: Props) {
  await requireAdmin()

  const params = await searchParams
  const accountParam = String(params?.account || "").toUpperCase()
  const saved = String(params?.saved || "")
  const account = Object.values(WorkerAccount).includes(accountParam as WorkerAccount)
    ? (accountParam as WorkerAccount)
    : null

  const [movements, splits] = await Promise.all([
    prisma.paymentMovement.findMany({
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
    }),
    prisma.financialSplit.findMany({
      where: account ? { account, amount: { gt: 0 } } : { amount: { gt: 0 } },
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
  ])

  const totalPaid = movements.reduce(
    (sum, movement) => roundMoney(sum + movement.amount),
    0
  )
  const pendingSplits = splits
    .map((split) => {
      const paid = getPaidAmount(split)

      return {
        ...split,
        paid,
        missing: missingMoney(split.amount, paid),
      }
    })
    .filter((split) => split.missing > 0)
  const pendingTotal = pendingSplits.reduce(
    (sum, split) => roundMoney(sum + split.missing),
    0
  )

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
            Movimentos e valores por pagar
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            O extrato separa pagamentos às contas dos valores que ainda faltam pagar.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
            {formatMoney(totalPaid)} pago
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100">
            {formatMoney(pendingTotal)} por pagar
          </div>
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

      {saved && (
        <div className="mb-4 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">
            {saved === "moved"
              ? "Movimento corrigido e transferido para a conta certa."
              : "Movimento anulado com registo de correção."}
          </p>
          <p className="mt-1 text-emerald-100/75">
            Os saldos foram recalculados sem apagar o histórico original.
          </p>
        </div>
      )}

      <div className="mb-4 overflow-hidden rounded-3xl border border-amber-400/20 bg-amber-500/5">
        <div className="border-b border-amber-400/20 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Valores por pagar às contas</h2>
          <p className="text-sm text-zinc-400">
            Serviços que ainda não têm a parcela totalmente paga à conta selecionada.
          </p>
        </div>

        <div className="divide-y divide-amber-400/10">
          {pendingSplits.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              Não há valores em falta para este filtro.
            </div>
          ) : (
            pendingSplits.map((split) => {
              const appointment = split.appointment

              return (
                <Link
                  key={split.id}
                  href={`/agenda/${appointment.id}`}
                  className="grid gap-3 p-4 transition hover:bg-white/[0.03] lg:grid-cols-[140px_150px_1fr_130px_130px] lg:items-center"
                >
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">
                      Conta
                    </p>
                    <p className="mt-1 font-semibold text-white">
                      {accountLabel(split.account)}
                    </p>
                  </div>
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
                    <p className="mt-1 text-xs text-zinc-500">
                      Cliente: {appointment.isPaid ? "pago" : "por pagar"}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-zinc-500">Pago à conta</p>
                    <p className="font-semibold text-emerald-300">
                      {formatMoney(split.paid)}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="text-zinc-500">Falta pagar</p>
                    <p className="font-semibold text-amber-100">
                      {formatMoney(split.missing)}
                    </p>
                  </div>
                </Link>
              )
            })
          )}
        </div>
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
                      {accountLabel(movement.account)} ·{" "}
                      {movement.notes || "Pagamento"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {methodLabel(movement.method)} · {formatDate(movement.paidAt)}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-emerald-300">
                    {formatMoney(movement.amount)}
                  </p>
                </div>

                {movement.amount > 0 && (
                  <div className="grid gap-3 border-b border-white/10 bg-white/[0.02] p-4 lg:grid-cols-[1fr_1fr]">
                    <form
                      action={movePaymentMovement}
                      className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[1fr_160px_auto] sm:items-end"
                    >
                      <input type="hidden" name="movementId" value={movement.id} />
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Nota da correção
                        <input
                          name="correctionNote"
                          placeholder="Ex: pagamento era da FamaDetail"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
                        />
                      </label>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Mover para
                        <select
                          name="targetAccount"
                          defaultValue=""
                          required
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-red-300/60"
                        >
                          <option value="">Escolher conta</option>
                          {Object.values(WorkerAccount)
                            .filter((item) => item !== movement.account)
                            .map((item) => (
                              <option key={item} value={item}>
                                {accountLabel(item)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <ConfirmSubmitButton
                        message="Confirmas mover este pagamento para outra conta? O movimento original fica registado e serão criados movimentos de correção."
                        className="min-h-10 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-100 transition hover:bg-sky-500/20"
                      >
                        Mover
                      </ConfirmSubmitButton>
                    </form>

                    <form
                      action={voidPaymentMovement}
                      className="grid gap-2 rounded-2xl border border-red-400/20 bg-red-500/5 p-3 sm:grid-cols-[1fr_auto] sm:items-end"
                    >
                      <input type="hidden" name="movementId" value={movement.id} />
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Motivo da anulação
                        <input
                          name="correctionNote"
                          placeholder="Ex: movimento duplicado"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
                        />
                      </label>
                      <ConfirmSubmitButton
                        message="Confirmas anular este movimento? Será criado um movimento negativo e nada será apagado."
                        className="min-h-10 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-100 transition hover:bg-red-500/20"
                      >
                        Anular
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                )}

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
                              <p className="mt-1 text-xs text-zinc-500">
                                Cliente: {appointment.isPaid ? "pago" : "por pagar"}
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
