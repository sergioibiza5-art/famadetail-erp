import Link from "next/link"
import { revalidatePath } from "next/cache"
import { Car, Plus } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function createVehicle(formData: FormData) {
  "use server"

  const customerId = String(formData.get("customerId") || "")
  const brand = String(formData.get("brand") || "").trim()
  const model = String(formData.get("model") || "").trim()
  const plate = String(formData.get("plate") || "").trim().toUpperCase()
  const color = String(formData.get("color") || "").trim()
  const yearValue = String(formData.get("year") || "").trim()
  const year = yearValue ? Number(yearValue) : null

  if (!customerId || !brand || !model || !plate) return

  await prisma.vehicle.create({
    data: {
      customerId,
      brand,
      model,
      plate,
      color: color || null,
      year: Number.isFinite(year) ? year : null,
      timeline: {
        create: {
          title: "Carro registado",
          description: "Entrada criada no ERP.",
          type: "CREATED",
        },
      },
    },
  })

  revalidatePath("/carros")
  revalidatePath("/dashboard")
}

export default async function VehiclesPage() {
  const [customers, vehicles] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Carros
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Gestao de veiculos
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Abre o historico para fotos, marcacoes e evolucao do carro.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          Total: {vehicles.length}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <form
          action={createVehicle}
          className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Adicionar carro</h2>
              <p className="text-sm text-zinc-400">Criar novo veiculo</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Cliente
              <select
                name="customerId"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              >
                <option value="">Selecionar cliente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Marca
              <input
                name="brand"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                placeholder="Marca"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Modelo
              <input
                name="model"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                placeholder="Modelo"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Matricula
              <input
                name="plate"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase text-white outline-none focus:border-red-300/60"
                placeholder="MATRICULA"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Cor
                <input
                  name="color"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                  placeholder="Cor"
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Ano
                <input
                  name="year"
                  type="number"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                  placeholder="Ano"
                />
              </label>
            </div>
          </div>

          <button className="mt-5 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
            Guardar carro
          </button>
        </form>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Lista de carros</h2>
            <p className="text-sm text-zinc-400">Toque num carro para abrir</p>
          </div>

          <div className="divide-y divide-white/10">
            {vehicles.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">
                Nenhum carro registado.
              </p>
            ) : (
              vehicles.map((vehicle) => (
                <Link
                  key={vehicle.id}
                  href={`/carros/${vehicle.id}`}
                  className="grid gap-3 p-4 transition hover:bg-white/[0.03] sm:grid-cols-[1.2fr_1fr_auto]"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                      <Car className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        {vehicle.brand} {vehicle.model}
                      </h3>
                      <p className="text-sm text-zinc-400">{vehicle.plate}</p>
                    </div>
                  </div>

                  <div className="text-sm text-zinc-400">
                    <p className="text-white">{vehicle.customer.name}</p>
                    <p>{vehicle.color || "Sem cor"} · {vehicle.year || "Sem ano"}</p>
                  </div>

                  <span className="self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300">
                    {vehicle.status}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
