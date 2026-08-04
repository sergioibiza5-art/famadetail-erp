import Link from "next/link"
import { AppointmentStatus } from "@prisma/client"
import { ArrowLeft, Package, ShoppingCart } from "lucide-react"
import { requireAdmin } from "@/lib/auth"
import { formatMoney } from "@/lib/finance"
import { getProductUnitCost, productTypeLabel } from "@/lib/product-stock"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function ShoppingListPage() {
  await requireAdmin()

  const [products, activeAppointments] = await Promise.all([
    prisma.product.findMany({
      where: {
        minStock: {
          gt: 0,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        status: {
          in: [
            AppointmentStatus.PENDING,
            AppointmentStatus.CONFIRMED,
            AppointmentStatus.IN_PROGRESS,
          ],
        },
      },
      include: {
        serviceTemplate: {
          include: {
            productUsages: true,
          },
        },
      },
    }),
  ])

  const projectedConsumption = new Map<string, number>()

  for (const appointment of activeAppointments) {
    for (const usage of appointment.serviceTemplate?.productUsages || []) {
      projectedConsumption.set(
        usage.productId,
        (projectedConsumption.get(usage.productId) || 0) + Math.abs(usage.quantity)
      )
    }
  }

  const lowStock = products
    .map((product) => {
      const reserved = projectedConsumption.get(product.id) || 0
      const projectedStock = product.stock - reserved
      const missing = Math.max(0, product.minStock - projectedStock)
      const unitCost = getProductUnitCost(product)

      return {
        ...product,
        reserved,
        projectedStock,
        missing,
        estimatedCost: missing * unitCost,
      }
    })
    .filter((product) => product.missing > 0)
    .sort((a, b) => b.missing - a.missing)

  const totalEstimatedCost = lowStock.reduce(
    (sum, product) => sum + product.estimatedCost,
    0
  )

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
            Stock
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Lista de compras
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Produtos abaixo do minimo ou em risco com os servicos ja marcados.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {formatMoney(totalEstimatedCost)} estimado
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">A comprar</h2>
              <p className="text-sm text-zinc-400">
                {lowStock.length} produto(s) em falta
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {lowStock.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              Nenhum produto abaixo do minimo nem em risco pela agenda ativa.
            </div>
          ) : (
            lowStock.map((product) => (
              <Link
                key={product.id}
                href={`/stock/${product.id}`}
                className="grid gap-3 p-4 transition hover:bg-white/[0.03] sm:grid-cols-[44px_1fr_120px_120px_120px_130px] sm:items-center"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-200">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-white">{product.name}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {productTypeLabel(product.type)} · minimo {product.minStock}{" "}
                    {product.unit || "un"}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-zinc-500">Atual</p>
                  <p className="font-semibold text-white">
                    {product.stock} {product.unit || "un"}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-zinc-500">Reservado</p>
                  <p className="font-semibold text-white">
                    {product.reserved} {product.unit || "un"}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-zinc-500">Previsto</p>
                  <p className="font-semibold text-amber-100">
                    {product.projectedStock} {product.unit || "un"}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-zinc-500">Comprar</p>
                  <p className="font-semibold text-white">
                    {product.missing} {product.unit || "un"} ·{" "}
                    {formatMoney(product.estimatedCost)}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
