import Link from "next/link"
import { revalidatePath } from "next/cache"
import { CalendarDays, Car, Plus, User } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function createCustomer(formData: FormData) {
  "use server"

  const name = String(formData.get("name") || "").trim()
  const phone = String(formData.get("phone") || "").trim()
  const email = String(formData.get("email") || "").trim()
  const notes = String(formData.get("notes") || "").trim()

  if (!name) return

  await prisma.customer.create({
    data: {
      name,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
    },
  })

  revalidatePath("/clientes")
  revalidatePath("/dashboard")
}

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    include: {
      _count: {
        select: {
          vehicles: true,
          appointments: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Clientes
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Gestao de clientes
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Abre qualquer cliente para consultar dados, carros e marcacoes.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          Total: {customers.length}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <form
          action={createCustomer}
          className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Novo cliente</h2>
              <p className="text-sm text-zinc-400">Adicionar contacto</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Nome
              <input
                name="name"
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                placeholder="Nome do cliente"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Telefone
              <input
                name="phone"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                placeholder="Contacto"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Email
              <input
                name="email"
                type="email"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                placeholder="Email opcional"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Notas
              <textarea
                name="notes"
                rows={4}
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                placeholder="Notas internas"
              />
            </label>
          </div>

          <button className="mt-5 w-full rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
            Guardar cliente
          </button>
        </form>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Lista de clientes</h2>
            <p className="text-sm text-zinc-400">Toque num cliente para abrir</p>
          </div>

          <div className="divide-y divide-white/10">
            {customers.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">
                Nenhum cliente registado.
              </p>
            ) : (
              customers.map((customer) => (
                <Link
                  key={customer.id}
                  href={`/clientes/${customer.id}`}
                  className="grid gap-3 p-4 transition hover:bg-white/[0.03] sm:grid-cols-[1fr_auto_auto]"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{customer.name}</h3>
                      <p className="text-sm text-zinc-400">
                        {customer.phone || "Sem telefone"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Car className="h-4 w-4" />
                    {customer._count.vehicles} carro(s)
                  </div>

                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <CalendarDays className="h-4 w-4" />
                    {customer._count.appointments} marcacao(oes)
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
