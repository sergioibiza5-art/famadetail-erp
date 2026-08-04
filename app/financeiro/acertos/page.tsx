import Link from "next/link"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { ArrowLeft, CheckCircle, WalletCards } from "lucide-react"
import { PaymentMethod, WorkerAccount } from "@prisma/client"
import { SaveSubmitButton } from "@/components/save-submit-button"
import { requireAdmin } from "@/lib/auth"
import { accountLabel, formatMoney, payWorkerAccount, roundMoney } from "@/lib/finance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{
    saved?: string
  }>
}

async function createFinancialAdjustment(formData: FormData) {
  "use server"

  await requireAdmin()

  const account = String(formData.get("account") || "") as WorkerAccount
  const amountValue = String(formData.get("amount") || "")
  const methodValue = String(formData.get("method") || "")
  const paidAtValue = String(formData.get("paidAt") || "")
  const notes =
    String(formData.get("notes") || "").trim() || "Acerto financeiro manual"
  const method = Object.values(PaymentMethod).includes(methodValue as PaymentMethod)
    ? (methodValue as PaymentMethod)
    : null

  if (!Object.values(WorkerAccount).includes(account)) return

  await payWorkerAccount({
    account,
    amountValue,
    payAll: false,
    method,
    notes,
    paidAtValue,
  })

  revalidatePath("/financeiro")
  revalidatePath(`/financeiro/${account}`)
  revalidatePath("/financeiro/movimentos")
  revalidatePath("/financeiro/acertos")
  revalidatePath("/dashboard")

  redirect("/financeiro/acertos?saved=1")
}

function methodLabel(method: PaymentMethod | null) {
  if (method === "CASH") return "Numerário"
  if (method === "MBWAY") return "MB Way"
  return "Sem método"
}

export default async function FinancialAdjustmentsPage({ searchParams }: Props) {
  await requireAdmin()

  const params = await searchParams
  const recentAdjustments = await prisma.paymentMovement.findMany({
    where: {
      notes: {
        contains: "Acerto",
        mode: "insensitive",
      },
    },
    orderBy: { paidAt: "desc" },
    take: 10,
  })

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
            Acertos financeiros
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Regista diferenças de pagamentos antigos, arredondamentos e saldos a favor.
          </p>
        </div>
      </div>

      {params?.saved && (
        <div className="mb-4 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-300" />
            <p className="font-semibold">Acerto guardado e financeiro atualizado.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <form
          action={createFinancialAdjustment}
          className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Novo acerto</h2>
              <p className="text-sm text-zinc-400">
                Ex: faltou registar 1,24 € pagos a mais.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Conta
              <select
                name="account"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              >
                {Object.values(WorkerAccount).map((account) => (
                  <option key={account} value={account}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Valor
              <input
                name="amount"
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Nota
              <input
                name="notes"
                placeholder="Ex: Acerto pagamento Adriana 40 €"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
              />
            </label>
          </div>

          <SaveSubmitButton
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white disabled:cursor-wait disabled:opacity-70"
            pendingText="A guardar acerto..."
          >
            Guardar acerto
          </SaveSubmitButton>
        </form>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Acertos recentes</h2>
            <p className="text-sm text-zinc-400">
              Últimos movimentos marcados como acerto.
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {recentAdjustments.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">
                Ainda não existem acertos registados.
              </p>
            ) : (
              recentAdjustments.map((movement) => (
                <Link
                  key={movement.id}
                  href={`/financeiro/movimentos?account=${movement.account}`}
                  className="grid gap-3 p-4 transition hover:bg-white/[0.03] sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {accountLabel(movement.account)} · {movement.notes || "Acerto"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {methodLabel(movement.method)} ·{" "}
                      {new Intl.DateTimeFormat("pt-PT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(movement.paidAt)}
                    </p>
                  </div>
                  <p className="font-semibold text-emerald-300">
                    {formatMoney(roundMoney(movement.amount))}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
