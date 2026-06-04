import Link from "next/link"
import { revalidatePath } from "next/cache"
import { Wrench } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function createServiceTemplate(formData: FormData) {
  "use server"

  const name = String(formData.get("name") || "")
  const description = String(formData.get("description") || "")
  const price = Number(formData.get("price") || 0)
  const durationMinutes = Number(formData.get("durationMinutes") || 0)

  if (!name || !price || !durationMinutes) return

  await prisma.serviceTemplate.create({
    data: { name, description: description || null, price, durationMinutes },
  })

  revalidatePath("/servicos")
  revalidatePath("/agenda")
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

export default async function ServicosPage() {
  const services = await prisma.serviceTemplate.findMany({
    orderBy: { createdAt: "desc" },
  })

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Servicos</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Catalogo de servicos disponiveis na FamaDetail
          </p>
        </div>
        <div className="w-fit rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          Total: <span className="font-bold text-white">{services.length}</span>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form
          action={createServiceTemplate}
          className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Novo servico</h2>
              <p className="text-sm text-zinc-400">Adicionar ao catalogo</p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              ["name", "Nome do servico", "text"],
              ["price", "Preco", "number"],
              ["durationMinutes", "Duracao em minutos", "number"],
            ].map(([name, label, type]) => (
              <label key={name} className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {label}
                </span>
                <input
                  name={name}
                  type={type}
                  step={name === "price" ? "0.01" : undefined}
                  required
                  className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
                />
              </label>
            ))}

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Descricao
              </span>
              <textarea
                name="description"
                rows={4}
                className="w-full resize-none rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
              />
            </label>

            <button className="w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-black transition hover:bg-white">
              Guardar servico
            </button>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-5">
            <h2 className="text-lg font-semibold">Lista de servicos</h2>
            <p className="text-sm text-zinc-400">
              Abre qualquer servico para rever ou editar
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {services.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Nenhum servico criado.
              </div>
            ) : (
              services.map((service) => (
                <div
                  key={service.id}
                  className="grid gap-4 p-4 transition hover:bg-white/5 md:grid-cols-[1fr_120px_120px_1fr_100px] md:items-center md:p-5"
                >
                  <div className="font-semibold text-white">{service.name}</div>
                  <div className="text-sm font-semibold text-red-300">
                    {formatMoney(service.price)}
                  </div>
                  <div className="text-sm text-zinc-300">
                    {formatDuration(service.durationMinutes)}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {service.description || "Sem descricao"}
                  </div>
                  <Link
                    href={`/servicos/${service.id}`}
                    className="inline-flex min-h-10 w-fit items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/10"
                  >
                    Abrir
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </section>
  )
}
