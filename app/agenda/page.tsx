import Link from "next/link"
import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { AppointmentStatus } from "@prisma/client"
import { CalendarDays, CheckCircle, Clock, Euro, XCircle } from "lucide-react"
import { AgendaCreateForm } from "@/components/agenda-create-form"
import { updateAppointmentStatusWithStock } from "@/lib/appointment-stock"
import { requireAdmin } from "@/lib/auth"
import { formatMoney } from "@/lib/finance"
import { prisma } from "@/lib/prisma"
import { nextServiceOrderNumber } from "@/lib/service-order"

export const dynamic = "force-dynamic"

type AgendaPageProps = {
  searchParams?: Promise<{
    q?: string
    status?: string
    day?: string
  }>
}

type AppointmentItem = Awaited<
  ReturnType<typeof prisma.appointment.findMany>
>[number] & {
  customer: { name: string }
  vehicle: { brand: string; model: string; plate?: string | null }
  serviceTemplate: { name: string; price: number; durationMinutes: number } | null
}

type AppointmentGroup = ReturnType<typeof groupAppointments>[number]

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
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
      return "Concluída"
    case "CANCELLED":
      return "Cancelada"
    default:
      return status
  }
}

function paymentLabel(isPaid: boolean, method: string | null) {
  if (!isPaid) return "Por pagar"
  if (method === "CASH") return "Pago · Numerário"
  if (method === "MBWAY") return "Pago · MB Way"
  return "Pago"
}

function groupPaymentLabel(appointments: AppointmentItem[]) {
  const paidCount = appointments.filter((appointment) => appointment.isPaid).length
  if (paidCount === 0) return "Por pagar"
  if (paidCount < appointments.length) return "Parcialmente pago"

  const paymentMethod =
    appointments.find((appointment) => appointment.paymentMethod)?.paymentMethod || null

  return paymentLabel(true, paymentMethod)
}

function groupStatus(appointments: AppointmentItem[]) {
  const priority: AppointmentStatus[] = [
    "IN_PROGRESS",
    "CONFIRMED",
    "PENDING",
    "COMPLETED",
    "CANCELLED",
  ]

  return (
    priority.find((status) =>
      appointments.some((appointment) => appointment.status === status)
    ) || appointments[0].status
  )
}

function groupAppointments(appointments: AppointmentItem[]) {
  const groups = new Map<string, AppointmentItem[]>()

  for (const appointment of appointments) {
    const key = appointment.groupId || appointment.orderNumber || appointment.id
    const group = groups.get(key) || []
    group.push(appointment)
    groups.set(key, group)
  }

  return [...groups.values()]
    .map((items) => {
      const sortedItems = [...items].sort((a, b) => a.date.getTime() - b.date.getTime())
      const first = sortedItems[0]
      const last = sortedItems[sortedItems.length - 1]
      const endDate = sortedItems.reduce<Date | null>((latest, appointment) => {
        if (!appointment.endDate) return latest
        if (!latest || appointment.endDate > latest) return appointment.endDate
        return latest
      }, last.endDate)
      const totalPrice = sortedItems.reduce(
        (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
        0
      )

      return {
        id: first.id,
        orderNumber: first.orderNumber,
        customer: first.customer,
        vehicle: first.vehicle,
        date: first.date,
        endDate,
        status: groupStatus(sortedItems),
        paymentLabel: groupPaymentLabel(sortedItems),
        serviceCount: sortedItems.length,
        totalPrice,
        services: sortedItems.map(
          (appointment) => appointment.serviceTemplate?.name || appointment.title
        ),
        title:
          sortedItems.length === 1
            ? sortedItems[0].serviceTemplate?.name || sortedItems[0].title
            : `${sortedItems.length} serviços`,
      }
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

async function createAppointment(formData: FormData) {
  "use server"

  await requireAdmin()

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

  await prisma.$transaction(async (tx) => {
    const appointmentOrderNumber = await nextServiceOrderNumber(tx, cursor)

    for (let index = 0; index < selectedTemplates.length; index += 1) {
      const template = selectedTemplates[index]
      if (!template) continue

      const startDate = new Date(cursor)
      const endDate = new Date(startDate.getTime() + template.durationMinutes * 60000)

      await tx.appointment.create({
        data: {
          orderNumber: appointmentOrderNumber,
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
  })

  revalidatePath("/agenda")
  revalidatePath("/dashboard")
  revalidatePath("/marcar")
}

async function updateStatus(formData: FormData) {
  "use server"

  await requireAdmin()

  const id = String(formData.get("id") || "")
  const status = String(formData.get("status") || "") as AppointmentStatus

  if (!id || !Object.values(AppointmentStatus).includes(status)) return

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: { groupId: true },
  })
  const targetAppointments = appointment?.groupId
    ? await prisma.appointment.findMany({
        where: { groupId: appointment.groupId },
        select: { id: true },
      })
    : [{ id }]

  for (const targetAppointment of targetAppointments) {
    await updateAppointmentStatusWithStock(targetAppointment.id, status)
  }

  revalidatePath("/agenda")
  revalidatePath(`/agenda/${id}`)
  revalidatePath("/dashboard")
  revalidatePath("/marcar")
  revalidatePath("/stock")
  revalidatePath("/analytics")
}

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const filters = await searchParams
  const q = String(filters?.q || "").trim().toLowerCase()
  const statusFilter = String(filters?.status || "")
  const dayFilter = String(filters?.day || "")

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

  const filteredAppointments = appointments.filter((appointment) => {
    const matchesSearch =
      !q ||
      [
        appointment.title,
        appointment.orderNumber,
        appointment.customer.name,
        appointment.vehicle.plate,
        appointment.vehicle.brand,
        appointment.vehicle.model,
        appointment.serviceTemplate?.name,
        appointment.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    const matchesStatus = !statusFilter || appointment.status === statusFilter
    const matchesDay =
      !dayFilter || appointment.date.toISOString().slice(0, 10) === dayFilter

    return matchesSearch && matchesStatus && matchesDay
  })

  const customerRequests = filteredAppointments.filter(
    (appointment) =>
      appointment.status === "PENDING" &&
      appointment.notes?.includes("Pedido criado pela p")
  )

  const activeAppointments = filteredAppointments.filter(
    (appointment) =>
      !["COMPLETED", "CANCELLED"].includes(appointment.status) &&
      !customerRequests.some((request) => request.id === appointment.id)
  )

  const historicAppointments = filteredAppointments
    .filter((appointment) => ["COMPLETED", "CANCELLED"].includes(appointment.status))
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const customerRequestGroups = groupAppointments(customerRequests)
  const activeAppointmentGroups = groupAppointments(activeAppointments)
  const historicAppointmentGroups = groupAppointments(historicAppointments).sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  )

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Agenda
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            Marcações
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Agendamentos agrupados por OS. Abre um agendamento para ver os serviços.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
          {activeAppointmentGroups.length} ativo(s)
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
          <form className="grid gap-3 rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Procurar
              <input
                name="q"
                defaultValue={q}
                placeholder="Cliente, matrícula, serviço, OS..."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Estado
              <select
                name="status"
                defaultValue={statusFilter}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              >
                <option value="">Todos</option>
                {Object.values(AppointmentStatus).map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Dia
              <input
                name="day"
                type="date"
                defaultValue={dayFilter}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>
            <button className="min-h-12 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              Filtrar
            </button>
          </form>

          <div className="overflow-hidden rounded-3xl border border-red-400/20 bg-red-500/5">
            <div className="flex items-center justify-between gap-3 border-b border-red-400/20 p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold">Pedidos de clientes</h2>
                <p className="text-sm text-zinc-400">Pedidos feitos na página pública</p>
              </div>
              <span className="rounded-full border border-red-300/30 px-3 py-1 text-xs font-semibold text-red-200">
                {customerRequestGroups.length} pendente(s)
              </span>
            </div>

            <div className="divide-y divide-red-400/20">
              {customerRequestGroups.length === 0 ? (
                <p className="p-8 text-center text-sm text-zinc-500">
                  Nenhum pedido de cliente pendente.
                </p>
              ) : (
                customerRequestGroups.map((group) => (
                  <div key={group.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
                    <AppointmentGroupLink group={group} />

                    <div className="flex flex-wrap items-center gap-2">
                      <form action={updateStatus}>
                        <input type="hidden" name="id" value={group.id} />
                        <input type="hidden" name="status" value="CONFIRMED" />
                        <button className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-xs font-black text-black">
                          <CheckCircle className="h-4 w-4" />
                          Confirmar
                        </button>
                      </form>
                      <form action={updateStatus}>
                        <input type="hidden" name="id" value={group.id} />
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
            title="Marcações ativas"
            subtitle="Agendamentos ativos, agrupados por OS"
            groups={activeAppointmentGroups}
          />

          <AppointmentList
            title="Histórico"
            subtitle="Agendamentos concluídos ou cancelados"
            groups={historicAppointmentGroups}
            historic
          />
        </div>
      </div>
    </section>
  )
}

function AppointmentGroupLink({ group }: { group: AppointmentGroup }) {
  return (
    <Link href={`/agenda/${group.id}`} className="block min-w-0">
      <p className="font-semibold text-white">{group.title}</p>
      <p className="mt-1 text-xs font-semibold text-red-200">
        {group.orderNumber || "Sem OS"} · {group.serviceCount} serviço(s)
      </p>
      <p className="mt-1 truncate text-sm text-zinc-400">
        {group.customer.name} · {group.vehicle.brand} {group.vehicle.model}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500">
        {group.services.join(" · ")}
      </p>
    </Link>
  )
}

function AppointmentList({
  title,
  subtitle,
  groups,
  historic = false,
}: {
  title: string
  subtitle: string
  groups: AppointmentGroup[]
  historic?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-400">{subtitle}</p>
      </div>

      <div className="divide-y divide-white/10">
        {groups.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">
            Nenhuma marcação.
          </p>
        ) : (
          groups.map((group) => (
            <Link
              key={group.id}
              href={`/agenda/${group.id}`}
              className="grid gap-3 p-4 transition hover:bg-white/[0.03] lg:grid-cols-[1fr_140px_140px_140px]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  {historic ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <CalendarDays className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white">{group.title}</p>
                  <p className="mt-1 text-xs font-semibold text-red-200">
                    {group.orderNumber || "Sem OS"} · {group.serviceCount} serviço(s)
                  </p>
                  <p className="mt-1 truncate text-sm text-zinc-400">
                    {group.customer.name} · {group.vehicle.brand} {group.vehicle.model}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {group.services.join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{group.paymentLabel}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Clock className="h-4 w-4" />
                {formatTime(group.date)}
                {group.endDate ? ` - ${formatTime(group.endDate)}` : ""}
              </div>

              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Euro className="h-4 w-4" />
                {formatMoney(group.totalPrice)}
              </div>

              <span className="self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300">
                {statusLabel(group.status)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
