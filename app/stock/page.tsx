import Link from "next/link"
import { revalidatePath } from "next/cache"
import { ProductType } from "@prisma/client"
import { Minus, Package, Plus } from "lucide-react"
import {
  defaultUnitForProductType,
  getProductStockValue,
  productTypeLabel,
} from "@/lib/product-stock"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

async function createProduct(formData: FormData) {
  "use server"

  const name = String(formData.get("name") || "").trim()
  const typeValue = String(formData.get("type") || "LIQUID") as ProductType
  const type = Object.values(ProductType).includes(typeValue)
    ? typeValue
    : ProductType.LIQUID
  const initialStock = Number(formData.get("initialStock") || 0)
  const stock = Number(formData.get("stock") || initialStock || 0)
  const minStock = Number(formData.get("minStock") || 0)
  const price = Number(formData.get("price") || 0)
  const unit =
    String(formData.get("unit") || "").trim() || defaultUnitForProductType(type)
  const notes = String(formData.get("notes") || "").trim()

  if (!name) return

  await prisma.product.create({
    data: {
      name,
      type,
      initialStock: Number.isFinite(initialStock) ? initialStock : 0,
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

export default async function StockPage() {
  const products = await prisma.product.findMany({
    include: {
      movements: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { name: "asc" },
  })

  const totalStockValue = products.reduce(
    (sum, product) => sum + getProductStockValue(product),
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
            Produtos e movimentos da operacao.
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

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Tipo
                <select
                  name="type"
                  defaultValue="LIQUID"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                >
                  {Object.values(ProductType).map((type) => (
                    <option key={type} value={type}>
                      {productTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Qtd. inicial
                  <input
                    name="initialStock"
                    type="number"
                    step="0.01"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                    placeholder="Produto cheio"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Qtd. atual
                  <input
                    name="stock"
                    type="number"
                    step="0.01"
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                    placeholder="Quanto tens agora"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  Preco compra
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
                    placeholder="ml, g, un"
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
                  <Link
                    key={product.id}
                    href={`/stock/${product.id}`}
                    className="grid gap-3 p-4 transition hover:bg-white/[0.03] sm:grid-cols-[1fr_120px_130px_110px] sm:items-center"
                  >
                    <div>
                      <p className="font-semibold text-white">{product.name}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {productTypeLabel(product.type)} · {product.notes || "Sem notas"}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-zinc-500">Atual</p>
                      <p className="font-semibold text-white">
                        {product.stock} {product.unit || "un"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        cheio: {product.initialStock || product.stock} {product.unit || "un"}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="text-zinc-500">Valor</p>
                      <p className="font-semibold text-white">
                        {formatMoney(getProductStockValue(product))}
                      </p>
                    </div>
                    <span
                      className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
                        product.stock <= product.minStock
                          ? "border-red-400/25 bg-red-500/10 text-red-200"
                          : "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                      }`}
                    >
                      {product.stock <= product.minStock ? "Baixo" : "OK"}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
