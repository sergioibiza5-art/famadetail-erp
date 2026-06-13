import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { ProductType } from "@prisma/client"
import { ArrowLeft, Package, Save } from "lucide-react"
import {
  defaultUnitForProductType,
  getProductStockValue,
  getProductUnitCost,
  productTypeLabel,
} from "@/lib/product-stock"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ id: string }>
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      movements: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  })

  if (!product) notFound()

  async function updateProduct(formData: FormData) {
    "use server"

    const name = String(formData.get("name") || "").trim()
    const typeValue = String(formData.get("type") || "LIQUID") as ProductType
    const type = Object.values(ProductType).includes(typeValue)
      ? typeValue
      : ProductType.LIQUID
    const initialStock = Number(formData.get("initialStock") || 0)
    const stock = Number(formData.get("stock") || 0)
    const minStock = Number(formData.get("minStock") || 0)
    const price = Number(formData.get("price") || 0)
    const unit =
      String(formData.get("unit") || "").trim() || defaultUnitForProductType(type)
    const notes = String(formData.get("notes") || "").trim()

    if (!name) return

    await prisma.product.update({
      where: { id },
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
    revalidatePath(`/stock/${id}`)
    revalidatePath("/analytics")
  }

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <Link
        href="/stock"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao stock
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Produto
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {product.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Edita dados, stock minimo, preco e notas do produto.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {formatMoney(getProductStockValue(product))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <form
          action={updateProduct}
          className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Editar produto</h2>
              <p className="text-sm text-zinc-400">Dados principais</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Produto
              <input
                name="name"
                defaultValue={product.name}
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Tipo
              <select
                name="type"
                defaultValue={product.type}
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
                  defaultValue={product.initialStock || product.stock}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Qtd. atual
                <input
                  name="stock"
                  type="number"
                  step="0.01"
                  defaultValue={product.stock}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
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
                  defaultValue={product.minStock}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
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
                  defaultValue={product.price}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Unidade
                <input
                  name="unit"
                  defaultValue={product.unit || ""}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>
            </div>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Notas
              <textarea
                name="notes"
                rows={5}
                defaultValue={product.notes || ""}
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>
          </div>

          <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white transition hover:bg-red-400">
            <Save className="h-4 w-4" />
            Guardar alteracoes
          </button>
        </form>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <p className="text-sm text-zinc-400">Atual</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {product.stock} {product.unit || "un"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                cheio: {product.initialStock || product.stock} {product.unit || "un"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <p className="text-sm text-zinc-400">Minimo</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {product.minStock} {product.unit || "un"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <p className="text-sm text-zinc-400">Valor</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {formatMoney(getProductStockValue(product))}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {formatMoney(getProductUnitCost(product))}/{product.unit || "un"}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Movimentos recentes</h2>
              <p className="text-sm text-zinc-400">Entradas e saidas registadas</p>
            </div>
            <div className="divide-y divide-white/10">
              {product.movements.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Sem movimentos registados.
                </p>
              ) : (
                product.movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  >
                    <p className="font-semibold text-white">
                      {movement.notes || "Sem notas"}
                    </p>
                    <p
                      className={
                        movement.quantity >= 0
                          ? "font-semibold text-emerald-300"
                          : "font-semibold text-red-300"
                      }
                    >
                      {movement.quantity >= 0 ? "+" : ""}
                      {movement.quantity} {product.unit || "un"}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatDate(movement.createdAt)}
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
