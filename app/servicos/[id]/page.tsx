import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { ArrowLeft, Clock, Euro, Package, Plus, Save, Trash2, Wrench } from "lucide-react"
import { getProductUnitCost } from "@/lib/product-stock"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function updateServiceTemplate(formData: FormData) {
  "use server"

  const serviceId = String(formData.get("serviceId") || "")
  const name = String(formData.get("name") || "")
  const description = String(formData.get("description") || "")
  const price = Number(formData.get("price") || 0)
  const durationMinutes = Number(formData.get("durationMinutes") || 0)

  if (!serviceId || !name || !price || !durationMinutes) return

  await prisma.serviceTemplate.update({
    where: { id: serviceId },
    data: { name, description: description || null, price, durationMinutes },
  })

  revalidatePath("/servicos")
  revalidatePath(`/servicos/${serviceId}`)
  revalidatePath("/agenda")
  revalidatePath("/dashboard")
  revalidatePath("/analytics")
  revalidatePath("/marcar")
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0)
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`
  if (hours > 0) return `${hours}h`
  return `${mins}min`
}

async function addProductUsage(formData: FormData) {
  "use server"

  const serviceId = String(formData.get("serviceId") || "")
  const productId = String(formData.get("productId") || "")
  const quantity = Number(formData.get("quantity") || 0)

  if (!serviceId || !productId || !Number.isFinite(quantity) || quantity <= 0) return

  await prisma.serviceProductUsage.upsert({
    where: {
      serviceTemplateId_productId: {
        serviceTemplateId: serviceId,
        productId,
      },
    },
    update: { quantity },
    create: {
      serviceTemplateId: serviceId,
      productId,
      quantity,
    },
  })

  revalidatePath(`/servicos/${serviceId}`)
}

async function updateProductUsage(formData: FormData) {
  "use server"

  const serviceId = String(formData.get("serviceId") || "")
  const usageId = String(formData.get("usageId") || "")
  const quantity = Number(formData.get("quantity") || 0)

  if (!serviceId || !usageId || !Number.isFinite(quantity) || quantity <= 0) return

  await prisma.serviceProductUsage.update({
    where: { id: usageId },
    data: { quantity },
  })

  revalidatePath(`/servicos/${serviceId}`)
}

async function deleteProductUsage(formData: FormData) {
  "use server"

  const serviceId = String(formData.get("serviceId") || "")
  const usageId = String(formData.get("usageId") || "")

  if (!serviceId || !usageId) return

  await prisma.serviceProductUsage.delete({
    where: { id: usageId },
  })

  revalidatePath(`/servicos/${serviceId}`)
}

export default async function ServiceTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const service = await prisma.serviceTemplate.findUnique({
    where: { id },
    include: {
      productUsages: {
        include: {
          product: true,
        },
        orderBy: {
          product: {
            name: "asc",
          },
        },
      },
      appointments: {
        include: { customer: true, vehicle: true },
        orderBy: { date: "desc" },
        take: 6,
      },
    },
  })

  if (!service) notFound()

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
  })

  const totalProductCost = service.productUsages.reduce(
    (sum, usage) => sum + usage.quantity * getProductUnitCost(usage.product),
    0
  )

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <Link
        href="/servicos"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-red-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos servicos
      </Link>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-300">
            Servico
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {service.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Abrir, rever e editar o servico do catalogo.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr] xl:gap-6">
        <form
          action={updateServiceTemplate}
          className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
        >
          <input type="hidden" name="serviceId" value={service.id} />
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Editar servico</h2>
              <p className="text-sm text-zinc-400">
                Atualiza os dados usados nas marcacoes
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Nome do servico
              </span>
              <input
                name="name"
                defaultValue={service.name}
                required
                className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Preco
              </span>
              <input
                name="price"
                type="number"
                step="0.01"
                defaultValue={service.price}
                required
                className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Duracao em minutos
              </span>
              <input
                name="durationMinutes"
                type="number"
                defaultValue={service.durationMinutes}
                required
                className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Descricao
              </span>
              <textarea
                name="description"
                defaultValue={service.description || ""}
                rows={5}
                className="w-full resize-none rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
              />
            </label>
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-black transition hover:bg-white">
              <Save className="h-4 w-4" />
              Guardar alteracoes
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <div className="mb-2 flex items-center gap-2 text-red-300">
                <Euro className="h-4 w-4" />
                <p className="text-xs uppercase text-zinc-500">Preco</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatMoney(service.price)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <div className="mb-2 flex items-center gap-2 text-red-300">
                <Clock className="h-4 w-4" />
                <p className="text-xs uppercase text-zinc-500">Duracao</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatDuration(service.durationMinutes)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <div className="mb-2 flex items-center gap-2 text-red-300">
                <Package className="h-4 w-4" />
                <p className="text-xs uppercase text-zinc-500">Custo produtos</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatMoney(totalProductCost)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0B0C]">
            <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Produtos gastos</h2>
                  <p className="text-sm text-zinc-400">
                    Desconta automaticamente quando a marcacao fica concluida
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-red-200/80">
                  Total gasto
                </p>
                <p className="mt-1 text-lg font-black text-white">
                  {formatMoney(totalProductCost)}
                </p>
              </div>
            </div>

            <form
              action={addProductUsage}
              className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-[1fr_130px_auto] sm:items-end sm:p-5"
            >
              <input type="hidden" name="serviceId" value={service.id} />
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Produto
                <select
                  name="productId"
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
                >
                  <option value="">Selecionar produto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.stock} {product.unit || "un"})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Quantidade
                <input
                  name="quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
                  placeholder="Ex: 40"
                />
              </label>
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-black transition hover:bg-white">
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </form>

            <div className="divide-y divide-white/10">
              {service.productUsages.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-400">
                  Ainda nao ha produtos definidos para este servico.
                </div>
              ) : (
                service.productUsages.map((usage) => (
                  <div
                    key={usage.id}
                    className="grid gap-3 p-4 sm:grid-cols-[1fr_130px_auto_auto] sm:items-center sm:p-5"
                  >
                    <div>
                      <p className="font-semibold text-white">{usage.product.name}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        Stock atual: {usage.product.stock} {usage.product.unit || "un"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Custo: {formatMoney(usage.quantity * getProductUnitCost(usage.product))}
                      </p>
                    </div>
                    <form action={updateProductUsage} className="flex gap-2">
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="usageId" value={usage.id} />
                      <input
                        name="quantity"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={usage.quantity}
                        className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
                      />
                      <button className="rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/10">
                        Guardar
                      </button>
                    </form>
                    <p className="text-sm font-semibold text-zinc-300">
                      {usage.quantity} {usage.product.unit || "un"} / servico
                    </p>
                    <form action={deleteProductUsage}>
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="usageId" value={usage.id} />
                      <button className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 text-red-200 transition hover:bg-red-500/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Ultimas marcacoes</h2>
              <p className="text-sm text-zinc-400">
                Historico recente deste servico
              </p>
            </div>
            <div className="divide-y divide-white/10">
              {service.appointments.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-400">
                  Ainda nao existem marcacoes com este servico.
                </div>
              ) : (
                service.appointments.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/agenda/${appointment.id}`}
                    className="grid gap-2 p-4 transition hover:bg-white/5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {appointment.customer.name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {appointment.vehicle.brand} {appointment.vehicle.model}
                      </p>
                    </div>
                    <p className="text-sm text-zinc-300">
                      {new Intl.DateTimeFormat("pt-PT", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(appointment.date)}
                    </p>
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
