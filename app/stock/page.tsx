import { revalidatePath } from "next/cache"
import { ExpenseCategory } from "@prisma/client"
import { Minus, Package, Plus, Receipt } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
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

async function createProduct(formData: FormData) {
  "use server"

  const name = String(formData.get("name") || "").trim()
  const stock = Number(formData.get("stock") || 0)
  const minStock = Number(formData.get("minStock") || 0)
  const price = Number(formData.get("price") || 0)
  const unit = String(formData.get("unit") || "").trim()
  const notes = String(formData.get("notes") || "").trim()

  if (!name) return

  await prisma.product.create({
    data: {
      name,
      stock: Number.isFinite(stock) ? stock : 0,
      minStock: Number.isFinite(minStock) ? minStock : 0,
      price: Number.isFinite(price) ? price : 0,
      unit: unit || null,
      notes: notes || null,
    },
  })

  revalidatePath("/stock")
}

async function createMovement(formData: FormData) {
  "use server"

  const productId = String(formData.get("productId") || "")
  const type = String(formData.get("type") || "IN")
  const quantityValue = Number(formData.get("quantity") || 0)
  const notes = String(formData.get("notes") || "").trim()
  const quantity = type === "OUT" ? -Math.abs(quantityValue) : Math.abs(quantityValue)

  if (!productId || !Number.isFinite(quantity) || quantity === 0) return

  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        productId,
        quantity,
        notes: notes || null,
      },
    }),
    prisma.product.update({
      where: { id: productId },
      data: {
        stock: {
          increment: quantity,
        },
      },
    }),
  ])

  revalidatePath("/stock")
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

  revalidatePath("/stock")
  revalidatePath("/analytics")
}

export default async function StockPage() {
  const [products, expenses] = await Promise.all([
    prisma.product.findMany({
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.expense.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ])

  const totalStockValue = products.reduce(
    (sum, product) => sum + product.stock * product.price,
    0
  )
  const lowStock = products.filter((product) => product.stock <= product.minStock)

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Stock
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Gestao de stock
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Produtos, movimentos e despesas da operacao.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {formatMoney(totalStockValue)}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <form
            action={createProduct}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Novo produto</h2>
                <p className="text-sm text-zinc-400">Adicionar ao stock</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Produto
                <input
                  name="name"
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                  placeholder="Nome do produto"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Stock
                  <input
                    name="stock"
                    type="number"
                    step="0.01"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                    placeholder="0"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Minimo
                  <input
                    name="minStock"
                    type="number"
                    step="0.01"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                    placeholder="0"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Preco
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                    placeholder="0"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Unidade
                  <input
                    name="unit"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                    placeholder="L, un, kg"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Notas
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>
            </div>

            <button className="mt-5 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              Guardar produto
            </button>
          </form>

          <form
            action={createMovement}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <h2 className="mb-4 text-lg font-semibold">Movimento</h2>
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Produto
                <select
                  name="productId"
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                >
                  <option value="">Selecionar produto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
                  <input type="radio" name="type" value="IN" defaultChecked />
                  <Plus className="h-4 w-4 text-red-300" />
                  Entrada
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
                  <input type="radio" name="type" value="OUT" />
                  <Minus className="h-4 w-4 text-red-300" />
                  Saida
                </label>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Quantidade
                <input
                  name="quantity"
                  required
                  type="number"
                  step="0.01"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Notas
                <input
                  name="notes"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>
            </div>

            <button className="mt-5 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              Registar movimento
            </button>
          </form>
        </div>

        <div className="space-y-4">
          {lowStock.length > 0 && (
            <div className="rounded-3xl border border-red-400/20 bg-red-500/5 p-4">
              <h2 className="text-lg font-semibold text-red-100">Stock baixo</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {lowStock.length} produto(s) abaixo do minimo.
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Produtos</h2>
              <p className="text-sm text-zinc-400">Inventario atual</p>
            </div>
            <div className="divide-y divide-white/10">
              {products.length === 0 ? (
                <p className="p-8 text-center text-sm text-zinc-500">
                  Nenhum produto registado.
                </p>
              ) : (
                products.map((product) => (
                  <div
                    key={product.id}
                    className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]"
                  >
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-zinc-400">
                        {product.notes || "Sem notas"}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-zinc-500">Stock</p>
                      <p className="font-semibold">
                        {product.stock} {product.unit || "un"}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-zinc-500">Valor</p>
                      <p className="font-semibold">{formatMoney(product.stock * product.price)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

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

            <div className="grid gap-3 sm:grid-cols-2">
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
                <input
                  name="notes"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>
            </div>

            <button className="mt-4 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              Guardar despesa
            </button>
          </form>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4">
              <h2 className="text-lg font-semibold">Despesas recentes</h2>
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
                    className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto]"
                  >
                    <p className="font-semibold">{expense.title}</p>
                    <p className="text-sm text-zinc-400">{categoryLabel(expense.category)}</p>
                    <p className="font-semibold">{formatMoney(expense.amount)}</p>
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
