"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarDays, CheckCircle, Clock, Loader2 } from "lucide-react"

type Service = {
  id: string
  name: string
}

type Slot = {
  value: string
  label: string
  readyAt: string
  readyLabel: string
  spansMultipleDays: boolean
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
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    services[0]?.id ? [services[0].id] : []
  )
  const [date, setDate] = useState(getToday())
  const [slots, setSlots] = useState<Slot[]>([])
  const [slot, setSlot] = useState("")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [needsPickup, setNeedsPickup] = useState("NO")

  const selectedSlot = useMemo(
    () => slots.find((availableSlot) => availableSlot.value === slot),
    [slot, slots]
  )

  useEffect(() => {
    if (selectedServiceIds.length === 0 || !date) {
      return
    }

    let ignore = false

    async function loadSlots() {
      setLoadingSlots(true)
      setSlot("")
      setMessage("")

      try {
        const params = new URLSearchParams({ date })
        selectedServiceIds.forEach((id) =>
          params.append("serviceTemplateIds", id)
        )

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
  }, [selectedServiceIds, date])

  function toggleService(serviceId: string) {
    const next = selectedServiceIds.includes(serviceId)
      ? selectedServiceIds.filter((id) => id !== serviceId)
      : [...selectedServiceIds, serviceId]

    if (next.length === 0) {
      setSlots([])
      setSlot("")
    }

    setSelectedServiceIds(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage("")

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("dateTime", slot)
    formData.delete("serviceTemplateIds")
    selectedServiceIds.forEach((id) => formData.append("serviceTemplateIds", id))

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
      setSelectedServiceIds(services[0]?.id ? [services[0].id] : [])
      setMessage(
        data.message ||
          "Marcacao submetida. Depois da equipa confirmar, recebe a confirmacao no telemovel indicado ou por email se nao tiver telemovel."
      )
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
              Escolha um ou varios servicos e um horario disponivel
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Servicos
            </label>
            <span className="text-xs text-zinc-500">
              {selectedServiceIds.length} selecionado(s)
            </span>
          </div>

          <div className="grid gap-2">
            {services.map((service) => {
              const checked = selectedServiceIds.includes(service.id)

              return (
                <label
                  key={service.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                    checked
                      ? "border-zinc-100 bg-zinc-100 text-black"
                      : "border-white/10 bg-[#121214] text-white hover:border-white/20"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleService(service.id)}
                    className="h-4 w-4 accent-red-400"
                  />
                  <span className="font-semibold">{service.name}</span>
                </label>
              )
            })}
          </div>
        </div>

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
              Horario de entrada
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

          {!loadingSlots && selectedServiceIds.length === 0 && (
            <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              Selecione pelo menos um servico para ver horarios.
            </p>
          )}

          {!loadingSlots && selectedServiceIds.length > 0 && slots.length === 0 && (
            <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              Sem horarios livres para este dia. Escolha outro dia ou ajuste os
              servicos.
            </p>
          )}
        </div>

        {selectedSlot && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold text-white">
              Previsao de conclusao: {selectedSlot.readyLabel}
            </p>

            {selectedSlot.spansMultipleDays && (
              <div className="mt-3 flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Este pedido pode demorar mais de 1 dia para ficar pronto,
                  porque continua no proximo horario disponivel.
                </p>
              </div>
            )}
          </div>
        )}

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
              Telemovel
            </span>
            <input
              name="phone"
              placeholder="Telemovel"
              className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Email
          </span>
          <input
            name="email"
            type="email"
            placeholder="Email se nao indicar telemovel"
            className="w-full rounded-2xl border border-white/10 bg-[#121214] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-400"
          />
        </label>

        <p className="text-xs text-zinc-500">
          Indique pelo menos um contacto para receber a confirmacao.
        </p>

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
          disabled={!slot || selectedServiceIds.length === 0 || submitting}
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
