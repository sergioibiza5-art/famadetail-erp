"use client"

import { FormEvent, useEffect, useState } from "react"
import { CalendarDays, CheckCircle, Clock, Loader2 } from "lucide-react"

type Service = {
  id: string
  name: string
}

type Slot = {
  value: string
  label: string
}

type Props = {
  services: Service[]
  pickupEnabled: boolean
}

function getToday() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60 * 1000)

  return local.toISOString().slice(0, 10)
}

export function PublicBookingForm({ services, pickupEnabled }: Props) {
  const [serviceId, setServiceId] = useState(services[0]?.id || "")
  const [date, setDate] = useState(getToday())
  const [slots, setSlots] = useState<Slot[]>([])
  const [slot, setSlot] = useState("")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [needsPickup, setNeedsPickup] = useState("NO")

  useEffect(() => {
    if (!serviceId || !date) return

    let ignore = false

    async function loadSlots() {
      setLoadingSlots(true)
      setSlot("")
      setMessage("")

      try {
        const params = new URLSearchParams({
          serviceTemplateId: serviceId,
          date,
        })
        const response = await fetch(`/api/public-booking/availability?${params}`)
        const data = await response.json()

        if (!ignore) {
          setSlots(data.slots || [])
        }
      } finally {
        if (!ignore) {
          setLoadingSlots(false)
        }
      }
    }

    loadSlots()

    return () => {
      ignore = true
    }
  }, [serviceId, date])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage("")

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("serviceTemplateId", serviceId)
    formData.set("dateTime", slot)

    try {
      const response = await fetch("/api/public-booking", {
        method: "POST",
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        setMessage(data.error || "Nao foi possivel criar a marcacao.")
        return
      }

      form.reset()
      setNeedsPickup("NO")
      setSlot("")
      setMessage("Pedido enviado. A FamaDetail vai confirmar a sua marcacao.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C] shadow-2xl shadow-black/30"
    >
      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Pedido de marcacao</h2>
            <p className="text-sm text-zinc-400">
              Escolha o servico e um horario disponivel
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Servico
          </span>
          <select
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            required
            className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
          >
            {services.map((service) => (
              <option
                key={service.id}
                value={service.id}
                className="bg-[#121214] text-white"
              >
                {service.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Dia
          </span>
          <input
            type="date"
            value={date}
            min={getToday()}
            onChange={(event) => setDate(event.target.value)}
            required
            className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none focus:border-red-400"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Horario
            </label>
            {loadingSlots && (
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                A verificar
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map((availableSlot) => (
              <button
                key={availableSlot.value}
                type="button"
                onClick={() => setSlot(availableSlot.value)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                  slot === availableSlot.value
                    ? "border-zinc-100 bg-zinc-100 text-black"
                    : "border-white/10 bg-[#121214] text-zinc-200 hover:border-white/20 hover:bg-white/5"
                }`}
              >
                <Clock className="h-4 w-4" />
                {availableSlot.label}
              </button>
            ))}
          </div>

          {!loadingSlots && slots.length === 0 && (
            <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              Sem horarios livres para este dia. Escolha outro dia ou outro
              servico.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Nome
            </span>
            <input
              name="name"
              placeholder="Nome"
              required
              className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Telefone
            </span>
            <input
              name="phone"
              placeholder="Telefone"
              required
              className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Email opcional
          </span>
          <input
            name="email"
            type="email"
            placeholder="Email opcional"
            className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Marca
            </span>
            <input
              name="brand"
              placeholder="Marca"
              required
              className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Modelo
            </span>
            <input
              name="model"
              placeholder="Modelo"
              required
              className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Matricula
            </span>
            <input
              name="plate"
              placeholder="Matricula"
              required
              className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm uppercase text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
            />
          </label>
        </div>

        {pickupEnabled && (
          <div className="rounded-2xl border border-white/10 bg-[#121214] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Levantamento e entrega ao domicilio
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white transition hover:border-white/20">
                <input
                  type="radio"
                  name="needsPickup"
                  value="NO"
                  checked={needsPickup === "NO"}
                  onChange={(event) => setNeedsPickup(event.target.value)}
                  className="accent-red-400"
                />
                Nao
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white transition hover:border-white/20">
                <input
                  type="radio"
                  name="needsPickup"
                  value="YES"
                  checked={needsPickup === "YES"}
                  onChange={(event) => setNeedsPickup(event.target.value)}
                  className="accent-red-400"
                />
                Sim
              </label>
            </div>

            {needsPickup === "YES" && (
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Morada
                </span>
                <textarea
                  name="pickupAddress"
                  placeholder="Morada para levantamento e entrega"
                  rows={3}
                  required
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
                />
              </label>
            )}
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Notas
          </span>
          <textarea
            name="notes"
            placeholder="Notas ou pedido especial"
            rows={4}
            className="w-full resize-none rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
          />
        </label>

        <button
          disabled={!slot || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          Pedir marcacao
        </button>

        {!slot && !loadingSlots && slots.length > 0 && (
          <p className="text-center text-xs text-zinc-500">
            Escolha um horario para ativar o pedido.
          </p>
        )}

        {message && (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
            {message}
          </p>
        )}
      </div>
    </form>
  )
}
