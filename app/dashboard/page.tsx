import Image from "next/image"
import Link from "next/link"
import {
  CalendarDays,
  Car,
  CheckCircle,
  Euro,
  Users,
  Wrench,
} from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function getStatusLabel(status: string) {
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

function getPaymentMethodLabel(method: string | null) {
  switch (method) {
    case "CASH":
      return "Numerario"
    case "MBWAY":
      return "MB Way"
    default:
      return "Por pagar"
  }
}

export default async function DashboardPage() {
  const [
    customerCount,
    vehicleCount,
    customerRequests,
    activeAppointmentCandidates,
    completedAppointments,
    completedMetrics,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.vehicle.count(),
    prisma.appointment.findMany({
      where: {
        status: "PENDING",
        notes: {
          contains: "Pedido criado pela pagina publica.",
        },
      },
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
      orderBy: {
        date: "asc",
      },
    }),
    prisma.appointment.findMany({
      where: {
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
      orderBy: {
        date: "asc",
      },
    }),
    prisma.appointment.findMany({
      where: {
        status: "COMPLETED",
      },
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
      orderBy: {
        date: "desc",
      },
      take: 5,
    }),
    prisma.appointment.findMany({
      where: {
        status: "COMPLETED",
      },
      select: {
        isPaid: true,
        paymentMethod: true,
        serviceTemplate: {
          select: {
            price: true,
          },
        },
      },
    }),
  ])

  const customerRequestIds = new Set(
    customerRequests.map((appointment) => appointment.id)
  )
  const activeAppointments = activeAppointmentCandidates
    .filter((appointment) => !customerRequestIds.has(appointment.id))
    .slice(0, 5)

  const paidRevenue = completedMetrics.reduce(
    (sum, appointment) =>
      appointment.isPaid ? sum + (appointment.serviceTemplate?.price || 0) : sum,
    0
  )
  const unpaidRevenue = completedMetrics.reduce(
    (sum, appointment) =>
      !appointment.isPaid
        ? sum + (appointment.serviceTemplate?.price || 0)
        : sum,
    0
  )

  const cards = [
    {
      label: "Clientes",
      value: customerCount,
      detail: `${customerRequests.length} pedido(s) pendente(s)`,
      icon: Users,
    },
    {
      label: "Carros",
      value: vehicleCount,
      detail: "Registados",
      icon: Car,
    },
    {
      label: "Concluidos",
      value: completedMetrics.length,
      detail: "Servicos terminados",
      icon: CheckCircle,
    },
    {
      label: "Pago",
      value: formatMoney(paidRevenue),
      detail: `${formatMoney(unpaidRevenue)} por receber`,
      icon: Euro,
    },
  ]

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5 overflow-hidden rounded-3xl border border-white/10 bg-[#111010]">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_300px] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
              FamaDetail ERP
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Operacao do dia
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Agenda, pagamentos e trabalhos recentes num painel mais limpo para
              uso rapido no telemovel.
            </p>
          </div>

          <div className="relative hidden h-28 overflow-hidden rounded-2xl border border-white/10 bg-[#211d1d] sm:block">
            <Image
              src="/brand/famadetail-logo-cropped.png"
              alt="FamaDetail"
              fill
              priority
              sizes="300px"
              className="object-contain p-5"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon

          return (
            <div
              key={card.label}
              className="rounded-2xl border border-white/10 bg-[#0B0B0C] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-400">{card.label}</p>
                  <p className="mt-1 text-xs text-zinc-600">{card.detail}</p>
                </div>

                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white">{card.value}</h2>
            </div>
          )
        })}
      </div>

      {customerRequests.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-red-400/20 bg-red-500/5">
          <div className="border-b border-red-400/20 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Pedidos de clientes</h2>
                <p className="text-sm text-zinc-400">
                  Pedidos feitos pela pagina publica de marcacao
                </p>
              </div>

              <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                {customerRequests.length} pendente(s)
              </span>
            </div>
          </div>

          <div className="divide-y divide-red-400/10">
            {customerRequests.map((appointment) => (
              <Link
                key={appointment.id}
                href={`/agenda/${appointment.id}`}
                className="grid gap-3 p-4 transition hover:bg-white/5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-5"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
                  <CalendarDays className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {appointment.serviceTemplate?.name || appointment.title}
                  </p>

                  <p className="mt-1 truncate text-sm text-zinc-400">
                    {appointment.customer.name} · {appointment.vehicle.brand}{" "}
                    {appointment.vehicle.model}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                  <p className="text-sm text-zinc-300">
                    {formatDate(appointment.date)}
                  </p>
                  <p className="mt-1 w-fit rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 sm:ml-auto">
                    Pendente
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Agenda ativa</h2>

            <p className="text-sm text-zinc-400">
              Proximos trabalhos em aberto
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {activeAppointments.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Nenhuma marcacao ativa.
              </div>
            ) : (
              activeAppointments.map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/agenda/${appointment.id}`}
                  className="grid gap-3 p-4 transition hover:bg-white/5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
                    <CalendarDays className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {appointment.serviceTemplate?.name || appointment.title}
                    </p>

                    <p className="mt-1 truncate text-sm text-zinc-400">
                      {appointment.customer.name} · {appointment.vehicle.brand}{" "}
                      {appointment.vehicle.model}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                    <p className="text-sm text-zinc-300">
                      {formatDate(appointment.date)}
                    </p>
                    <p className="mt-1 w-fit rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 sm:ml-auto">
                      {getStatusLabel(appointment.status)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Ultimos concluidos</h2>

            <p className="text-sm text-zinc-400">
              Trabalhos terminados mais recentes
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {completedAppointments.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Nenhuma marcacao concluida.
              </div>
            ) : (
              completedAppointments.map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/agenda/${appointment.id}`}
                  className="grid gap-3 p-4 transition hover:bg-white/5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-zinc-300">
                    <Wrench className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {appointment.serviceTemplate?.name || appointment.title}
                    </p>

                    <p className="mt-1 truncate text-sm text-zinc-400">
                      {appointment.customer.name} · {appointment.vehicle.brand}{" "}
                      {appointment.vehicle.model}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                    <p className="text-sm font-semibold text-white">
                      {appointment.serviceTemplate
                        ? formatMoney(appointment.serviceTemplate.price)
                        : "-"}
                    </p>
                    <p
                      className={`mt-1 w-fit rounded-full border px-3 py-1 text-xs font-semibold sm:ml-auto ${
                        appointment.isPaid
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-400/20 bg-amber-500/10 text-amber-200"
                      }`}
                    >
                      {appointment.isPaid
                        ? getPaymentMethodLabel(appointment.paymentMethod)
                        : "Por pagar"}
                    </p>
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
