import Link from "next/link"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"
import { VehicleStatus } from "@prisma/client"
import { ArrowLeft, CalendarDays, Car, ImageIcon, Save, Trash2, User } from "lucide-react"
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

function statusLabel(status: VehicleStatus) {
  switch (status) {
    case "WAITING":
      return "Em espera"
    case "WAITING_BEFORE_PHOTOS":
      return "A aguardar fotos antes"
    case "STARTED":
      return "Iniciado"
    case "COMPLETED":
      return "Concluido"
    case "WAITING_AFTER_PHOTOS":
      return "A aguardar fotos depois"
    default:
      return status
  }
}

async function updateVehicle(formData: FormData) {
  "use server"

  const vehicleId = String(formData.get("vehicleId") || "")
  const customerId = String(formData.get("customerId") || "")
  const brand = String(formData.get("brand") || "").trim()
  const model = String(formData.get("model") || "").trim()
  const plate = String(formData.get("plate") || "").trim().toUpperCase()
  const color = String(formData.get("color") || "").trim()
  const yearValue = String(formData.get("year") || "").trim()
  const status = String(formData.get("status") || "") as VehicleStatus
  const notes = String(formData.get("notes") || "").trim()
  const year = yearValue ? Number(yearValue) : null

  if (
    !vehicleId ||
    !customerId ||
    !brand ||
    !model ||
    !plate ||
    !Object.values(VehicleStatus).includes(status)
  ) {
    return
  }

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      customerId,
      brand,
      model,
      plate,
      color: color || null,
      year: Number.isFinite(year) ? year : null,
      status,
      notes: notes || null,
    },
  })

  revalidatePath("/carros")
  revalidatePath(`/carros/${vehicleId}`)
  revalidatePath("/agenda")
  revalidatePath("/dashboard")
  revalidatePath("/analytics")
}

async function deleteVehicle(formData: FormData) {
  "use server"

  const vehicleId = String(formData.get("vehicleId") || "")
  if (!vehicleId) return

  const appointments = await prisma.appointment.findMany({
    where: { vehicleId },
    select: { id: true },
  })
  const appointmentIds = appointments.map((appointment) => appointment.id)

  await prisma.$transaction([
    prisma.stockMovement.deleteMany({
      where: { appointmentId: { in: appointmentIds } },
    }),
    prisma.vehiclePhoto.deleteMany({ where: { vehicleId } }),
    prisma.vehicleTimeline.deleteMany({ where: { vehicleId } }),
    prisma.financialSplit.deleteMany({
      where: { appointmentId: { in: appointmentIds } },
    }),
    prisma.appointmentWorker.deleteMany({
      where: { appointmentId: { in: appointmentIds } },
    }),
    prisma.appointment.deleteMany({ where: { vehicleId } }),
    prisma.service.deleteMany({ where: { vehicleId } }),
    prisma.vehicle.delete({ where: { id: vehicleId } }),
  ])

  revalidatePath("/carros")
  revalidatePath("/agenda")
  revalidatePath("/dashboard")
  revalidatePath("/financeiro")
  revalidatePath("/analytics")
  redirect("/carros")
}

export default async function VehicleDetailPage({ params }: Props) {
  const { id } = await params

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      customer: true,
      appointments: {
        include: {
          serviceTemplate: true,
        },
        orderBy: { date: "desc" },
      },
      photos: {
        orderBy: { createdAt: "desc" },
      },
      timeline: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!vehicle) notFound()

  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } })
  const beforePhotos = vehicle.photos.filter((photo) => photo.type === "BEFORE")
  const afterPhotos = vehicle.photos.filter((photo) => photo.type === "AFTER")

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <Link
        href="/carros"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos carros
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Historico do carro
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {vehicle.brand} {vehicle.model}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {vehicle.plate} · {vehicle.customer.name}
          </p>
        </div>

        <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-200">
          {statusLabel(vehicle.status)}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <Car className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Resumo</h2>
                <p className="text-sm text-zinc-400">Dados do veiculo</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Cor</p>
                <p className="mt-2 font-semibold">{vehicle.color || "Sem cor"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Ano</p>
                <p className="mt-2 font-semibold">{vehicle.year || "Sem ano"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Fotos</p>
                <p className="mt-2 font-semibold">{vehicle.photos.length}</p>
              </div>
              <Link
                href={`/clientes/${vehicle.customerId}`}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/[0.08]"
              >
                <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
                  <User className="h-4 w-4" />
                  Cliente
                </p>
                <p className="mt-2 font-semibold">{vehicle.customer.name}</p>
              </Link>
            </div>
          </div>

          <form
            action={updateVehicle}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <Save className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Editar carro</h2>
                <p className="text-sm text-zinc-400">Atualiza dados ou estado</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Cliente
                <select
                  name="customerId"
                  defaultValue={vehicle.customerId}
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Marca
                  <input
                    name="brand"
                    defaultValue={vehicle.brand}
                    required
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Modelo
                  <input
                    name="model"
                    defaultValue={vehicle.model}
                    required
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Matricula
                <input
                  name="plate"
                  defaultValue={vehicle.plate}
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase text-white outline-none focus:border-red-300/60"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Cor
                  <input
                    name="color"
                    defaultValue={vehicle.color || ""}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Ano
                  <input
                    name="year"
                    type="number"
                    defaultValue={vehicle.year || ""}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Estado
                <select
                  name="status"
                  defaultValue={vehicle.status}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                >
                  {Object.values(VehicleStatus).map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Notas
                <textarea
                  name="notes"
                  defaultValue={vehicle.notes || ""}
                  rows={4}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                />
              </label>
            </div>

            <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              <Save className="h-4 w-4" />
              Guardar carro
            </button>
          </form>

          <form
            action={deleteVehicle}
            className="rounded-3xl border border-red-400/20 bg-red-500/5 p-4 sm:p-5"
          >
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <h2 className="text-lg font-semibold text-red-100">Eliminar carro</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Remove o carro e o historico associado a ele.
            </p>
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20">
              <Trash2 className="h-4 w-4" />
              Eliminar carro
            </button>
          </form>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4">
              <h2 className="text-lg font-semibold">Timeline</h2>
              <p className="text-sm text-zinc-400">Eventos do carro</p>
            </div>
            <div className="divide-y divide-white/10">
              {vehicle.timeline.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Nenhum evento registado.
                </p>
              ) : (
                vehicle.timeline.map((event) => (
                  <div key={event.id} className="p-4">
                    <p className="font-semibold">{event.title}</p>
                    {event.description && (
                      <p className="mt-1 text-sm text-zinc-400">{event.description}</p>
                    )}
                    <p className="mt-2 text-xs text-zinc-600">
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Fotos antes/depois</h2>
              <p className="text-sm text-zinc-400">Registo visual do carro</p>
            </div>

            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Antes</h3>
                    <p className="text-sm text-zinc-400">{beforePhotos.length} foto(s)</p>
                  </div>
                  <ImageIcon className="h-5 w-5 text-red-300" />
                </div>
                <div className="mb-4">
                  <VehiclePhotoUpload vehicleId={vehicle.id} type="BEFORE" />
                </div>
                <PhotoGallery photos={beforePhotos} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Depois</h3>
                    <p className="text-sm text-zinc-400">{afterPhotos.length} foto(s)</p>
                  </div>
                  <ImageIcon className="h-5 w-5 text-red-300" />
                </div>
                <div className="mb-4">
                  <VehiclePhotoUpload vehicleId={vehicle.id} type="AFTER" />
                </div>
                <PhotoGallery photos={afterPhotos} />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4">
              <h2 className="text-lg font-semibold">Marcacoes</h2>
              <p className="text-sm text-zinc-400">Historico deste carro</p>
            </div>
            <div className="divide-y divide-white/10">
              {vehicle.appointments.length === 0 ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Nenhuma marcacao registada.
                </p>
              ) : (
                vehicle.appointments.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/agenda/${appointment.id}`}
                    className="grid gap-2 p-4 transition hover:bg-white/[0.03] sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-semibold">{appointment.title}</p>
                      <p className="text-sm text-zinc-400">
                        {appointment.serviceTemplate?.name || "Servico"}
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
