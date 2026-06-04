import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { AppointmentStatus, PaymentMethod } from "@prisma/client"
import {
  ArrowLeft,
  CalendarDays,
  Car,
  CheckCircle,
  CreditCard,
  Euro,
  Save,
  User,
} from "lucide-react"
import { PhotoGallery } from "@/components/photo-gallery"
import { VehiclePhotoUpload } from "@/components/vehicle-photo-upload"
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

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
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

function methodLabel(method: PaymentMethod | null) {
  if (method === "CASH") return "Numerario"
  if (method === "MBWAY") return "MB Way"
  return "Sem metodo"
}

export default async function AppointmentDetailPage({ params }: Props) {
  const { id } = await params

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      customer: true,
      vehicle: true,
      serviceTemplate: true,
      photos: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!appointment) notFound()

  const groupedAppointments = appointment.groupId
    ? await prisma.appointment.findMany({
        where: { groupId: appointment.groupId },
        include: { serviceTemplate: true },
        orderBy: { date: "asc" },
      })
    : [appointment]

  async function updateStatus(formData: FormData) {
    "use server"

    const status = String(formData.get("status") || "") as AppointmentStatus
    if (!Object.values(AppointmentStatus).includes(status)) return

    await prisma.appointment.update({
      where: { id },
      data: { status },
    })

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
    revalidatePath("/marcar")
  }

  async function updatePayment(formData: FormData) {
    "use server"

    const isPaid = String(formData.get("isPaid") || "") === "on"
    const paymentMethodValue = String(formData.get("paymentMethod") || "")
    const paymentMethod =
      isPaid && Object.values(PaymentMethod).includes(paymentMethodValue as PaymentMethod)
        ? (paymentMethodValue as PaymentMethod)
        : null

    await prisma.appointment.update({
      where: { id },
      data: {
        isPaid,
        paymentMethod,
      },
    })

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
  }

  const beforePhotos = appointment.photos.filter((photo) => photo.type === "BEFORE")
  const afterPhotos = appointment.photos.filter((photo) => photo.type === "AFTER")
  const totalPrice = groupedAppointments.reduce(
    (sum, item) => sum + (item.serviceTemplate?.price || 0),
    0
  )

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <Link
        href="/agenda"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar a agenda
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Marcacao
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {appointment.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Ficha operacional com inicio, conclusao, fotos e pagamento.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
            {statusLabel(appointment.status)}
          </span>
          <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
            {appointment.isPaid ? `Pago · ${methodLabel(appointment.paymentMethod)}` : "Por pagar"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Resumo</h2>
                <p className="text-sm text-zinc-400">Horario e valor da marcacao</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Inicio</p>
                <p className="mt-2 font-semibold">{formatDate(appointment.date)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Conclusao</p>
                <p className="mt-2 font-semibold">
                  {appointment.endDate ? formatDate(appointment.endDate) : "Sem fim"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
                    <Euro className="h-4 w-4" />
                    Valor
                  </p>
                  <p className="mt-2 font-semibold">{formatMoney(totalPrice)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Servicos</p>
                  <p className="mt-2 font-semibold">{groupedAppointments.length}</p>
                </div>
              </div>
            </div>
          </div>

          <form
            action={updateStatus}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <h2 className="mb-4 text-lg font-semibold">Estado do servico</h2>
            <div className="space-y-2">
              {Object.values(AppointmentStatus).map((status) => (
                <button
                  key={status}
                  name="status"
                  value={status}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    appointment.status === status
                      ? "border-zinc-100 bg-zinc-100 text-black"
                      : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {statusLabel(status)}
                  {appointment.status === status && <CheckCircle className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </form>

          <form
            action={updatePayment}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Pagamento</h2>
                <p className="text-sm text-zinc-400">Marca se ja foi pago</p>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
              <input
                name="isPaid"
                type="checkbox"
                defaultChecked={appointment.isPaid}
                className="h-4 w-4 accent-red-300"
              />
              Pago
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CASH"
                  defaultChecked={appointment.paymentMethod === "CASH"}
                  className="h-4 w-4 accent-red-300"
                />
                Numerario
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="MBWAY"
                  defaultChecked={appointment.paymentMethod === "MBWAY"}
                  className="h-4 w-4 accent-red-300"
                />
                MB Way
              </label>
            </div>

            <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              <Save className="h-4 w-4" />
              Guardar pagamento
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Cliente</h2>
                  <p className="text-sm text-zinc-400">{appointment.customer.phone || "Sem telefone"}</p>
                </div>
              </div>
              <p className="text-xl font-semibold">{appointment.customer.name}</p>
              <Link
                href={`/clientes/${appointment.customerId}`}
                className="mt-4 inline-flex rounded-full border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-200"
              >
                Abrir cliente
              </Link>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Car className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Carro</h2>
                  <p className="text-sm text-zinc-400">{appointment.vehicle.plate}</p>
                </div>
              </div>
              <p className="text-xl font-semibold">
                {appointment.vehicle.brand} {appointment.vehicle.model}
              </p>
              <Link
                href={`/carros/${appointment.vehicleId}`}
                className="mt-4 inline-flex rounded-full border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-200"
              >
                Abrir historico
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Servicos da marcacao</h2>
              <p className="text-sm text-zinc-400">Inicio e conclusao individual</p>
            </div>
            <div className="divide-y divide-white/10">
              {groupedAppointments.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-3 p-4 lg:grid-cols-[1fr_100px_100px_110px]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-500/10 text-sm font-black text-red-200">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-zinc-400">
                        {item.serviceTemplate?.durationMinutes || 0}min
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Inicio</p>
                    <p className="mt-1 font-semibold">{formatTime(item.date)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Conclusao</p>
                    <p className="mt-1 font-semibold">
                      {item.endDate ? formatTime(item.endDate) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Estado</p>
                    <p className="mt-1 font-semibold">{statusLabel(item.status)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {appointment.notes && (
            <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Notas</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                {appointment.notes}
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Fotos antes/depois</h2>
              <p className="text-sm text-zinc-400">Registo fotografico desta marcacao</p>
            </div>
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Antes</h3>
                    <p className="text-sm text-zinc-400">{beforePhotos.length} foto(s)</p>
                  </div>
                  <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-black text-red-200">
                    BEFORE
                  </span>
                </div>
                <div className="mb-4">
                  <VehiclePhotoUpload
                    vehicleId={appointment.vehicleId}
                    appointmentId={appointment.id}
                    type="BEFORE"
                  />
                </div>
                <PhotoGallery photos={beforePhotos} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Depois</h3>
                    <p className="text-sm text-zinc-400">{afterPhotos.length} foto(s)</p>
                  </div>
                  <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-black text-red-200">
                    AFTER
                  </span>
                </div>
                <div className="mb-4">
                  <VehiclePhotoUpload
                    vehicleId={appointment.vehicleId}
                    appointmentId={appointment.id}
                    type="AFTER"
                  />
                </div>
                <PhotoGallery photos={afterPhotos} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
