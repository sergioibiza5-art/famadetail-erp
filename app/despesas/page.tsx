import { revalidatePath } from "next/cache"
import { ExpenseCategory } from "@prisma/client"
import { Receipt, WalletCards } from "lucide-react"
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

function categoryLabel(category: ExpenseCategory) {
  switch (category) {
    case "PRODUCTS":
      return "Produtos"
    case "MATERIAL":
      return "Material"
    case "TOOLS":
      return "Ferramentas"
    case "MARKETING":
      return "Marketing"
    case "RENT":
      return "Renda"
    case "OTHER":
      return "Outro"
    default:
      return category
  }
}

async function createExpense(formData: FormData) {
  "use server"

  const title = String(formData.get("title") || "").trim()
  const amount = Number(formData.get("amount") || 0)
  const category = String(formData.get("category") || "OTHER") as ExpenseCategory
  const notes = String(formData.get("notes") || "").trim()

  if (!title || !Number.isFinite(amount)) return

  await prisma.expense.create({
    data: {
      title,
      amount,
      category: Object.values(ExpenseCategory).includes(category) ? category : "OTHER",
      notes: notes || null,
    },
  })

  revalidatePath("/despesas")
  revalidatePath("/analytics")
}

export default async function ExpensesPage() {
  const expenses = await prisma.expense.findMany({
    orderBy: { createdAt: "desc" },
  })

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthExpenses = expenses
    .filter((expense) => expense.createdAt >= monthStart)
    .reduce((sum, expense) => sum + expense.amount, 0)

  const categoryTotals = Object.values(ExpenseCategory).map((category) => ({
    category,
    total: expenses
      .filter((expense) => expense.category === category)
      .reduce((sum, expense) => sum + expense.amount, 0),
  }))

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Despesas
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Controlo de despesas
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Custos da operacao separados do stock.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4">
          <p className="text-sm text-zinc-400">Total registado</p>
          <p className="mt-3 text-2xl font-black text-white">
            {formatMoney(totalExpenses)}
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4">
          <p className="text-sm text-zinc-400">Este mes</p>
          <p className="mt-3 text-2xl font-black text-white">
            {formatMoney(monthExpenses)}
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4">
          <p className="text-sm text-zinc-400">Registos</p>
          <p className="mt-3 text-2xl font-black text-white">
            {expenses.length}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <form
          action={createExpense}
          className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Nova despesa</h2>
              <p className="text-sm text-zinc-400">Registar custo da operacao</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Titulo
              <input
                name="title"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Valor
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Categoria
              <select
                name="category"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              >
                {Object.values(ExpenseCategory).map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Notas
              <textarea
                name="notes"
                rows={4}
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>
          </div>

          <button className="mt-5 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
            Guardar despesa
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <WalletCards className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Por categoria</h2>
                <p className="text-sm text-zinc-400">Resumo acumulado</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {categoryTotals.map((item) => (
                <div
                  key={item.category}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
                >
                  <span className="text-zinc-300">{categoryLabel(item.category)}</span>
                  <span className="font-semibold text-white">{formatMoney(item.total)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Despesas recentes</h2>
              <p className="text-sm text-zinc-400">Historico de custos registados</p>
            </div>
            <div className="divide-y divide-white/10">
              {expenses.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Nenhuma despesa registada.
                </p>
              ) : (
                expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="grid gap-2 p-4 sm:grid-cols-[1fr_130px_120px_130px] sm:items-center"
                  >
                    <div>
                      <p className="font-semibold text-white">{expense.title}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {expense.notes || "Sem notas"}
                      </p>
                    </div>
                    <p className="text-sm text-zinc-400">
                      {categoryLabel(expense.category)}
                    </p>
                    <p className="font-semibold text-white">
                      {formatMoney(expense.amount)}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatDate(expense.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
