import Link from "next/link"
import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { AppointmentStatus } from "@prisma/client"
import { CalendarDays, CheckCircle, Clock, XCircle } from "lucide-react"
import { AgendaCreateForm } from "@/components/agenda-create-form"
import { updateAppointmentStatusWithStock } from "@/lib/appointment-stock"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function statusLabel(status: AppointmentStatus) {
  switch (status) {
    case "PENDING":
      return "Pendente"
    case "CONFIRMED":
      return "Confirmada"
    case "IN_PROGRESS":
      return "Em curso"
    case "COMPLETED":
      return "Concluida"
    case "CANCELLED":
      return "Cancelada"
    default:
      return status
  }
}

function paymentLabel(isPaid: boolean, method: string | null) {
  if (!isPaid) return "Por pagar"
  if (method === "CASH") return "Pago · Numerario"
  if (method === "MBWAY") return "Pago · MB Way"
  return "Pago"
}

async function createAppointment(formData: FormData) {
  "use server"

  const customerId = String(formData.get("customerId") || "")
  const vehicleId = String(formData.get("vehicleId") || "")
  const serviceIds = formData.getAll("serviceIds").map(String).filter(Boolean)
  const dateValue = String(formData.get("date") || "")
  const notes = String(formData.get("notes") || "").trim()

  if (!customerId || !vehicleId || serviceIds.length === 0 || !dateValue) return

  const serviceTemplates = await prisma.serviceTemplate.findMany({
    where: {
      id: {
        in: serviceIds,
      },
    },
  })

  if (serviceTemplates.length === 0) return

  const selectedTemplates = serviceIds
    .map((id) => serviceTemplates.find((template) => template.id === id))
    .filter(Boolean)

  let cursor = new Date(dateValue)
  const groupId = selectedTemplates.length > 1 ? randomUUID() : null

  for (let index = 0; index < selectedTemplates.length; index += 1) {
    const template = selectedTemplates[index]
    if (!template) continue

    const startDate = new Date(cursor)
    const endDate = new Date(startDate.getTime() + template.durationMinutes * 60000)

    await prisma.appointment.create({
      data: {
        title: template.name,
        notes: notes || null,
        date: startDate,
        endDate,
        status: "CONFIRMED",
        customerId,
        vehicleId,
        serviceTemplateId: template.id,
        groupId,
        serviceIndex: index + 1,
        serviceTotal: selectedTemplates.length,
      },
    })

    cursor = endDate
  }

  revalidatePath("/agenda")
  revalidatePath("/dashboard")
  revalidatePath("/marcar")
}

async function updateStatus(formData: FormData) {
  "use server"

  const id = String(formData.get("id") || "")
  const status = String(formData.get("status") || "") as AppointmentStatus

  if (!id || !Object.values(AppointmentStatus).includes(status)) return

  await updateAppointmentStatusWithStock(id, status)

  revalidatePath("/agenda")
  revalidatePath(`/agenda/${id}`)
  revalidatePath("/dashboard")
  revalidatePath("/marcar")
  revalidatePath("/stock")
  revalidatePath("/analytics")
}

export default async function AgendaPage() {
  const [customers, vehicles, services, appointments] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({
      select: {
        id: true,
        brand: true,
        model: true,
        plate: true,
        customerId: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.serviceTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.appointment.findMany({
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
      orderBy: { date: "asc" },
    }),
  ])

  const customerRequests = appointments.filter(
    (appointment) =>
      appointment.status === "PENDING" &&
      appointment.notes?.includes("Pedido criado pela pagina publica.")
  )

  const activeAppointments = appointments.filter(
    (appointment) =>
      !["COMPLETED", "CANCELLED"].includes(appointment.status) &&
      !customerRequests.some((request) => request.id === appointment.id)
  )

  const historicAppointments = appointments
    .filter((appointment) => ["COMPLETED", "CANCELLED"].includes(appointment.status))
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Agenda
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Marcacoes
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Pedidos, trabalhos ativos e historico separados para nao confundir.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {activeAppointments.length} ativo(s)
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <AgendaCreateForm
          customers={customers}
          vehicles={vehicles}
          services={services}
          createAppointment={createAppointment}
        />
        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-red-400/20 bg-red-500/5">
            <div className="flex items-center justify-between gap-3 border-b border-red-400/20 p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold">Pedidos de clientes</h2>
                <p className="text-sm text-zinc-400">Pedidos feitos na pagina publica</p>
              </div>
              <span className="rounded-full border border-red-300/30 px-3 py-1 text-xs font-semibold text-red-200">
                {customerRequests.length} pendente(s)
              </span>
            </div>

            <div className="divide-y divide-red-400/20">
              {customerRequests.length === 0 ? (
                <p className="p-8 text-center text-sm text-zinc-500">
                  Nenhum pedido de cliente pendente.
                </p>
              ) : (
                customerRequests.map((appointment) => (
                  <div key={appointment.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
                    <Link href={`/agenda/${appointment.id}`} className="block">
                      <p className="font-semibold">{appointment.title}</p>
                      <p className="text-sm text-zinc-400">
                        {appointment.customer.name} · {appointment.vehicle.brand} {appointment.vehicle.model}
                      </p>
                      <p className="mt-1 text-sm text-zinc-300">{formatDate(appointment.date)}</p>
                    </Link>

                    <div className="flex flex-wrap items-center gap-2">
                      <form action={updateStatus}>
                        <input type="hidden" name="id" value={appointment.id} />
                        <input type="hidden" name="status" value="CONFIRMED" />
                        <button className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-xs font-black text-black">
                          <CheckCircle className="h-4 w-4" />
                          Confirmar
                        </button>
                      </form>
                      <form action={updateStatus}>
                        <input type="hidden" name="id" value={appointment.id} />
                        <input type="hidden" name="status" value="CANCELLED" />
                        <button className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300">
                          <XCircle className="h-4 w-4" />
                          Cancelar
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <AppointmentList
            title="Marcacoes ativas"
            subtitle="Confirmadas, pendentes internas ou em curso"
            appointments={activeAppointments}
          />

          <AppointmentList
            title="Historico"
            subtitle="Marcacoes concluidas ou canceladas"
            appointments={historicAppointments}
            historic
          />
        </div>
      </div>
    </section>
  )
}

type AppointmentItem = Awaited<
  ReturnType<typeof prisma.appointment.findMany>
>[number] & {
  customer: { name: string }
  vehicle: { brand: string; model: string }
  serviceTemplate: { price: number; durationMinutes: number } | null
}

function AppointmentList({
  title,
  subtitle,
  appointments,
  historic = false,
}: {
  title: string
  subtitle: string
  appointments: AppointmentItem[]
  historic?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-400">{subtitle}</p>
      </div>

      <div className="divide-y divide-white/10">
        {appointments.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">
            Nenhuma marcacao.
          </p>
        ) : (
          appointments.map((appointment) => (
            <Link
              key={appointment.id}
              href={`/agenda/${appointment.id}`}
              className="grid gap-3 p-4 transition hover:bg-white/[0.03] lg:grid-cols-[1fr_120px_140px]"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  {historic ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <CalendarDays className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-white">{appointment.title}</p>
                  <p className="text-sm text-zinc-400">
                    {appointment.customer.name} · {appointment.vehicle.brand} {appointment.vehicle.model}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {paymentLabel(appointment.isPaid, appointment.paymentMethod)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Clock className="h-4 w-4" />
                {formatTime(appointment.date)}
                {appointment.endDate ? ` - ${formatTime(appointment.endDate)}` : ""}
              </div>

              <span className="self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300">
                {statusLabel(appointment.status)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
