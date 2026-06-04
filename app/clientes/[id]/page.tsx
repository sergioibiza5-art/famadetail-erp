import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { ArrowLeft, CalendarDays, Car, Mail, Phone, Save, User } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ id: string }>
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      vehicles: {
        orderBy: { createdAt: "desc" },
      },
      appointments: {
        include: {
          vehicle: true,
          serviceTemplate: true,
        },
        orderBy: { date: "desc" },
      },
    },
  })

  if (!customer) notFound()

  async function updateCustomer(formData: FormData) {
    "use server"

    const name = String(formData.get("name") || "").trim()
    const phone = String(formData.get("phone") || "").trim()
    const email = String(formData.get("email") || "").trim()
    const notes = String(formData.get("notes") || "").trim()

    if (!name) return

    await prisma.customer.update({
      where: { id },
      data: {
        name,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
      },
    })

    revalidatePath("/clientes")
    revalidatePath(`/clientes/${id}`)
    revalidatePath("/dashboard")
  }

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <Link
        href="/clientes"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos clientes
      </Link>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
          Cliente
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          {customer.name}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Dados, carros e marcacoes deste cliente.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <form
          action={updateCustomer}
          className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Editar cliente</h2>
              <p className="text-sm text-zinc-400">Atualiza os dados principais</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Nome
              <input
                name="name"
                defaultValue={customer.name}
                required
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Telefone
              <input
                name="phone"
                defaultValue={customer.phone || ""}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Email
              <input
                name="email"
                type="email"
                defaultValue={customer.email || ""}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Notas
              <textarea
                name="notes"
                rows={5}
                defaultValue={customer.notes || ""}
                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>
          </div>

          <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
            <Save className="h-4 w-4" />
            Guardar alteracoes
          </button>
        </form>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <div className="mb-3 flex items-center gap-2 text-zinc-400">
                <Phone className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Telefone</span>
              </div>
              <p className="font-semibold">{customer.phone || "Sem telefone"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4">
              <div className="mb-3 flex items-center gap-2 text-zinc-400">
                <Mail className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Email</span>
              </div>
              <p className="break-all font-semibold">{customer.email || "Sem email"}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4">
              <h2 className="text-lg font-semibold">Carros</h2>
              <p className="text-sm text-zinc-400">Veiculos associados</p>
            </div>
            <div className="divide-y divide-white/10">
              {customer.vehicles.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Nenhum carro associado.
                </p>
              ) : (
                customer.vehicles.map((vehicle) => (
                  <Link
                    key={vehicle.id}
                    href={`/carros/${vehicle.id}`}
                    className="flex items-center justify-between gap-3 p-4 transition hover:bg-white/[0.03]"
                  >
                    <div>
                      <p className="font-semibold">
                        {vehicle.brand} {vehicle.model}
                      </p>
                      <p className="text-sm text-zinc-400">{vehicle.plate}</p>
                    </div>
                    <Car className="h-5 w-5 text-red-300" />
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4">
              <h2 className="text-lg font-semibold">Marcacoes</h2>
              <p className="text-sm text-zinc-400">Historico recente</p>
            </div>
            <div className="divide-y divide-white/10">
              {customer.appointments.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Nenhuma marcacao registada.
                </p>
              ) : (
                customer.appointments.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/agenda/${appointment.id}`}
                    className="grid gap-2 p-4 transition hover:bg-white/[0.03] sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-semibold">{appointment.title}</p>
                      <p className="text-sm text-zinc-400">
                        {appointment.vehicle.brand} {appointment.vehicle.model}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <CalendarDays className="h-4 w-4" />
                      {formatDate(appointment.date)}
                    </div>
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
