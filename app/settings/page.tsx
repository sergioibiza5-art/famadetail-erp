import { revalidatePath } from "next/cache"
import { Clock, Save, Settings } from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const days = [
  { key: "monday", label: "Segunda" },
  { key: "tuesday", label: "Terca" },
  { key: "wednesday", label: "Quarta" },
  { key: "thursday", label: "Quinta" },
  { key: "friday", label: "Sexta" },
  { key: "saturday", label: "Sabado" },
  { key: "sunday", label: "Domingo" },
] as const

async function updateSettings(formData: FormData) {
  "use server"

  const businessName = String(formData.get("businessName") || "FamaDetail").trim()
  const slotStepMinutes = Number(formData.get("slotStepMinutes") || 30)
  const publicServiceIds = formData.getAll("publicServiceIds").map(String)

  const dayData = {
    monday: formData.get("monday") === "on",
    mondayOpenTime: String(formData.get("mondayOpenTime") || "09:00"),
    mondayCloseTime: String(formData.get("mondayCloseTime") || "18:00"),
    tuesday: formData.get("tuesday") === "on",
    tuesdayOpenTime: String(formData.get("tuesdayOpenTime") || "09:00"),
    tuesdayCloseTime: String(formData.get("tuesdayCloseTime") || "18:00"),
    wednesday: formData.get("wednesday") === "on",
    wednesdayOpenTime: String(formData.get("wednesdayOpenTime") || "09:00"),
    wednesdayCloseTime: String(formData.get("wednesdayCloseTime") || "18:00"),
    thursday: formData.get("thursday") === "on",
    thursdayOpenTime: String(formData.get("thursdayOpenTime") || "09:00"),
    thursdayCloseTime: String(formData.get("thursdayCloseTime") || "18:00"),
    friday: formData.get("friday") === "on",
    fridayOpenTime: String(formData.get("fridayOpenTime") || "09:00"),
    fridayCloseTime: String(formData.get("fridayCloseTime") || "18:00"),
    saturday: formData.get("saturday") === "on",
    saturdayOpenTime: String(formData.get("saturdayOpenTime") || "10:00"),
    saturdayCloseTime: String(formData.get("saturdayCloseTime") || "16:00"),
    sunday: formData.get("sunday") === "on",
    sundayOpenTime: String(formData.get("sundayOpenTime") || "10:00"),
    sundayCloseTime: String(formData.get("sundayCloseTime") || "14:00"),
  }

  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {
      businessName: businessName || "FamaDetail",
      bookingEnabled: formData.get("bookingEnabled") === "on",
      pickupEnabled: formData.get("pickupEnabled") === "on",
      openTime: dayData.mondayOpenTime,
      closeTime: dayData.mondayCloseTime,
      slotStepMinutes: Number.isFinite(slotStepMinutes) ? slotStepMinutes : 30,
      ...dayData,
    },
    create: {
      id: "default",
      businessName: businessName || "FamaDetail",
      bookingEnabled: formData.get("bookingEnabled") === "on",
      pickupEnabled: formData.get("pickupEnabled") === "on",
      openTime: dayData.mondayOpenTime,
      closeTime: dayData.mondayCloseTime,
      slotStepMinutes: Number.isFinite(slotStepMinutes) ? slotStepMinutes : 30,
      ...dayData,
    },
  })

  await prisma.$transaction([
    prisma.serviceTemplate.updateMany({
      data: {
        publicBookingEnabled: false,
      },
    }),
    prisma.serviceTemplate.updateMany({
      where: {
        id: {
          in: publicServiceIds,
        },
      },
      data: {
        publicBookingEnabled: true,
      },
    }),
  ])

  revalidatePath("/settings")
  revalidatePath("/marcar")
  revalidatePath("/api/public-booking/availability")
}

export default async function SettingsPage() {
  const [settings, services] = await Promise.all([
    prisma.appSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    }),
    prisma.serviceTemplate.findMany({
      orderBy: {
        name: "asc",
      },
    }),
  ])

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
          Settings
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          Definicoes
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Horarios da agenda publica, recolha ao domicilio e intervalos.
        </p>
      </div>

      <form
        action={updateSettings}
        className="grid gap-4 xl:grid-cols-[380px_1fr]"
      >
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Geral</h2>
              <p className="text-sm text-zinc-400">Dados da pagina publica</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Nome do negocio
              <input
                name="businessName"
                defaultValue={settings.businessName}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Intervalo dos horarios
              <input
                name="slotStepMinutes"
                type="number"
                min={15}
                step={15}
                defaultValue={settings.slotStepMinutes}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
              Marcacoes publicas
              <input
                name="bookingEnabled"
                type="checkbox"
                defaultChecked={settings.bookingEnabled}
                className="h-5 w-5 accent-red-300"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
              Levantamento e entrega
              <input
                name="pickupEnabled"
                type="checkbox"
                defaultChecked={settings.pickupEnabled}
                className="h-5 w-5 accent-red-300"
              />
            </label>
          </div>

          <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
            <Save className="h-4 w-4" />
            Guardar definicoes
          </button>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Servicos no /marcar</h2>
              <p className="text-sm text-zinc-400">
                Escolhe os servicos que os clientes podem pedir online
              </p>
            </div>

            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {services.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Ainda nao existem servicos criados.
                </p>
              ) : (
                services.map((service) => (
                  <label
                    key={service.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold"
                  >
                    <span>
                      <span className="block text-white">{service.name}</span>
                      <span className="text-xs text-zinc-500">
                        {service.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </span>
                    <input
                      name="publicServiceIds"
                      type="checkbox"
                      value={service.id}
                      defaultChecked={service.publicBookingEnabled}
                      disabled={!service.isActive}
                      className="h-5 w-5 accent-red-300 disabled:opacity-40"
                    />
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Horarios por dia</h2>
                  <p className="text-sm text-zinc-400">
                    Semana e fim de semana podem ser diferentes
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-white/10">
              {days.map((day) => {
                const enabled = settings[day.key]
                const openKey = `${day.key}OpenTime` as const
                const closeKey = `${day.key}CloseTime` as const

                return (
                  <div
                    key={day.key}
                    className="grid gap-3 p-4 sm:grid-cols-[160px_1fr_1fr]"
                  >
                    <label className="flex items-center gap-3 text-sm font-semibold">
                      <input
                        name={day.key}
                        type="checkbox"
                        defaultChecked={enabled}
                        className="h-5 w-5 accent-red-300"
                      />
                      {day.label}
                    </label>

                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Abertura
                      <input
                        name={openKey}
                        type="time"
                        defaultValue={settings[openKey]}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                      />
                    </label>

                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Fecho
                      <input
                        name={closeKey}
                        type="time"
                        defaultValue={settings[closeKey]}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </form>
    </section>
  )
}
