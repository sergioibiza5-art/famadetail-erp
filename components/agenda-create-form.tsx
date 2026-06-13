"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"

type Customer = {
  id: string
  name: string
}

type Vehicle = {
  id: string
  brand: string
  model: string
  plate: string
  customerId: string
}

type Service = {
  id: string
  name: string
  durationMinutes: number
}

type Props = {
  customers: Customer[]
  vehicles: Vehicle[]
  services: Service[]
  createAppointment: (formData: FormData) => Promise<void>
}

export function AgendaCreateForm({
  customers,
  vehicles,
  services,
  createAppointment,
}: Props) {
  const [customerId, setCustomerId] = useState("")

  const filteredVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.customerId === customerId),
    [customerId, vehicles]
  )

  return (
    <form
      action={createAppointment}
      className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
          <Plus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Nova marcacao</h2>
          <p className="text-sm text-zinc-400">Escolhe um ou varios servicos</p>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Cliente
          <select
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            required
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
          >
            <option value="">Selecionar cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Carro
          <select
            name="vehicleId"
            required
            disabled={!customerId}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">
              {customerId ? "Selecionar carro" : "Escolha primeiro o cliente"}
            </option>
            {filteredVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.brand} {vehicle.model} - {vehicle.plate}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Servicos</span>
            <span className="text-xs text-zinc-500">Seleciona varios</span>
          </div>

          <div className="space-y-2">
            {services.map((service) => (
              <label
                key={service.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="serviceIds"
                  value={service.id}
                  className="h-4 w-4 accent-red-300"
                />
                <span>
                  <span className="block font-semibold">{service.name}</span>
                  <span className="text-xs text-zinc-400">
                    {service.durationMinutes}min
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Inicio
          <input
            name="date"
            type="datetime-local"
            required
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
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
        Guardar marcacao
      </button>
    </form>
  )
}
