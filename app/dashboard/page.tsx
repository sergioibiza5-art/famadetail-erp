import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import {
  CalendarDays,
  Car,
  CheckCircle,
  Euro,
  ListChecks,
  Package,
  Users,
  Wrench,
} from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type DashboardAppointment = {
  id: string
  orderNumber: string | null
  title: string
  date: Date
  endDate: Date | null
  status: string
  groupId: string | null
  isPaid: boolean
  paymentMethod: string | null
  customer: { name: string }
  vehicle: { brand: string; model: string }
  serviceTemplate: { name: string; price: number; durationMinutes: number } | null
}

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
      return "Concluída"
    case "CANCELLED":
      return "Cancelada"
    default:
      return status
  }
}

function getPaymentMethodLabel(method: string | null) {
  switch (method) {
    case "CASH":
      return "Numerário"
    case "MBWAY":
      return "MB Way"
    default:
      return "Por pagar"
  }
}

function groupAppointments(appointments: DashboardAppointment[]) {
  const groups = new Map<string, DashboardAppointment[]>()

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
      const paidCount = sortedItems.filter((appointment) => appointment.isPaid).length

      return {
        id: first.id,
        orderNumber: first.orderNumber,
        title:
          sortedItems.length === 1
            ? sortedItems[0].serviceTemplate?.name || sortedItems[0].title
            : `${sortedItems.length} serviços`,
        date: first.date,
        endDate,
        status: first.status,
        customer: first.customer,
        vehicle: first.vehicle,
        serviceCount: sortedItems.length,
        services: sortedItems.map(
          (appointment) => appointment.serviceTemplate?.name || appointment.title
        ),
        totalPrice,
        isPaid: paidCount === sortedItems.length,
        isPartiallyPaid: paidCount > 0 && paidCount < sortedItems.length,
        paymentMethod:
          sortedItems.find((appointment) => appointment.paymentMethod)?.paymentMethod || null,
      }
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

export default async function DashboardPage() {
  const [
    customerCount,
    vehicleCount,
    customerRequests,
    activeAppointmentCandidates,
    completedAppointments,
    completedMetrics,
    productsForStockCheck,
    financeSplits,
    paymentMovements,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.vehicle.count(),
    prisma.appointment.findMany({
      where: {
        status: "PENDING",
        notes: {
          contains: "Pedido criado pela p",
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
      take: 30,
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
    prisma.product.findMany({
      where: {
        minStock: {
          gt: 0,
        },
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.financialSplit.findMany({
      select: {
        amount: true,
      },
    }),
    prisma.paymentMovement.findMany({
      select: {
        amount: true,
      },
    }),
  ])

  const customerRequestIds = new Set(customerRequests.map((appointment) => appointment.id))
  const activeAppointments = activeAppointmentCandidates.filter(
    (appointment) => !customerRequestIds.has(appointment.id)
  )
  const customerRequestGroups = groupAppointments(customerRequests)
  const activeAppointmentGroups = groupAppointments(activeAppointments)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)
  const todayAppointmentGroups = groupAppointments(
    activeAppointments.filter(
      (appointment) => appointment.date >= todayStart && appointment.date < todayEnd
    )
  )
  const completedAppointmentGroups = groupAppointments(completedAppointments)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5)
  const lowStockProducts = productsForStockCheck
    .filter((product) => product.stock <= product.minStock)
    .sort((a, b) => {
      const aMissing = a.minStock - a.stock
      const bMissing = b.minStock - b.stock

      return bMissing - aMissing
    })

  const totalGeneratedFinance = financeSplits.reduce(
    (sum, split) => sum + split.amount,
    0
  )
  const paidRevenue = paymentMovements.reduce(
    (sum, movement) => sum + movement.amount,
    0
  )
  const unpaidRevenue = Math.max(0, totalGeneratedFinance - paidRevenue)
  const financeCredit = Math.max(0, paidRevenue - totalGeneratedFinance)

  const cards = [
    {
      label: "Clientes",
      value: customerCount,
      detail: `${customerRequestGroups.length} pedido(s) pendente(s)`,
      icon: Users,
    },
    {
      label: "Carros",
      value: vehicleCount,
      detail: "Registados",
      icon: Car,
    },
    {
      label: "Concluídos",
      value: completedMetrics.length,
      detail: "Serviços terminados",
      icon: CheckCircle,
    },
    {
      label: "Stock baixo",
      value: lowStockProducts.length,
      detail: "Produto(s) a comprar",
      icon: Package,
    },
    {
      label: "Pago",
      value: formatMoney(paidRevenue),
      detail:
        financeCredit > 0
          ? `${formatMoney(financeCredit)} em saldo`
          : `${formatMoney(unpaidRevenue)} por receber`,
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
              Operação do dia
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Agenda, pagamentos e trabalhos recentes num painel mais limpo para
              uso rápido no telemóvel.
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            href: "/agenda",
            title: "Abrir agenda",
            detail: `${activeAppointmentGroups.length} em aberto`,
            icon: CalendarDays,
          },
          {
            href: "/marcar",
            title: "Página pública",
            detail: "Simular pedido de marcação",
            icon: Users,
          },
          {
            href: "/financeiro/movimentos",
            title: "Movimentos pagos",
            detail: "Ver extrato financeiro",
            icon: ListChecks,
          },
          {
            href: "/stock/compras",
            title: "Lista de compras",
            detail: `${lowStockProducts.length} produto(s) em falta`,
            icon: Package,
          },
        ].map((action) => {
          const Icon = action.icon

          return (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-red-300/30 hover:bg-red-500/10"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-white">{action.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{action.detail}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0C]">
        <div className="border-b border-white/10 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Hoje</h2>
              <p className="text-sm text-zinc-400">
                {todayAppointmentGroups.length} OS ativa(s) para hoje
              </p>
            </div>
            <Link
              href="/agenda"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Abrir agenda
            </Link>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {todayAppointmentGroups.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              Nenhuma OS ativa para hoje.
            </div>
          ) : (
            todayAppointmentGroups.map((appointment) => (
              <DashboardAppointmentRow
                key={appointment.id}
                appointment={appointment}
                icon={<CalendarDays className="h-5 w-5" />}
                status={getStatusLabel(appointment.status)}
                tone="red"
              />
            ))
          )}
        </div>
      </div>

      {customerRequestGroups.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-red-400/20 bg-red-500/5">
          <div className="border-b border-red-400/20 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Pedidos de clientes</h2>
                <p className="text-sm text-zinc-400">
                  Pedidos feitos pela página pública de marcação
                </p>
              </div>

              <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                {customerRequestGroups.length} pendente(s)
              </span>
            </div>
          </div>

          <div className="divide-y divide-red-400/10">
            {customerRequestGroups.map((appointment) => (
              <DashboardAppointmentRow
                key={appointment.id}
                appointment={appointment}
                icon={<CalendarDays className="h-5 w-5" />}
                tone="red"
              />
            ))}
          </div>
        </div>
      )}

      {lowStockProducts.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-amber-400/20 bg-amber-500/5">
          <div className="border-b border-amber-400/20 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Produtos com stock baixo</h2>
                <p className="text-sm text-zinc-400">
                  Lista rápida do que precisa de comprar.
                </p>
              </div>

              <Link
                href="/stock/compras"
                className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
              >
                Lista de compras
              </Link>
            </div>
          </div>

          <div className="divide-y divide-amber-400/10">
            {lowStockProducts.slice(0, 8).map((product) => {
              const missing = Math.max(0, product.minStock - product.stock)

              return (
                <Link
                  key={product.id}
                  href={`/stock/${product.id}`}
                  className="grid gap-3 p-4 transition hover:bg-white/5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-200">
                    <Package className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{product.name}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      Mínimo: {product.minStock} {product.unit || "un"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                    <p className="text-sm font-semibold text-amber-100">
                      {product.stock} {product.unit || "un"}
                    </p>
                    <p className="mt-1 w-fit rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 sm:ml-auto">
                      Comprar {missing} {product.unit || "un"}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Agenda ativa</h2>

            <p className="text-sm text-zinc-400">
              {activeAppointmentGroups.length} agendamento(s) em aberto
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {activeAppointmentGroups.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Nenhuma marcação ativa.
              </div>
            ) : (
              activeAppointmentGroups.map((appointment) => (
                <DashboardAppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  icon={<CalendarDays className="h-5 w-5" />}
                  status={getStatusLabel(appointment.status)}
                  tone="red"
                />
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0C]">
          <div className="border-b border-white/10 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Últimos concluídos</h2>

            <p className="text-sm text-zinc-400">
              Agendamentos terminados mais recentes
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {completedAppointmentGroups.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                Nenhuma marcação concluída.
              </div>
            ) : (
              completedAppointmentGroups.map((appointment) => (
                <DashboardAppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  icon={<Wrench className="h-5 w-5" />}
                  status={
                    appointment.isPaid
                      ? getPaymentMethodLabel(appointment.paymentMethod)
                      : appointment.isPartiallyPaid
                        ? "Parcial"
                        : "Por pagar"
                  }
                  amount={formatMoney(appointment.totalPrice)}
                  tone="zinc"
                  paid={appointment.isPaid}
                  partial={appointment.isPartiallyPaid}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function DashboardAppointmentRow({
  amount,
  appointment,
  icon,
  paid = false,
  partial = false,
  status,
  tone,
}: {
  amount?: string
  appointment: ReturnType<typeof groupAppointments>[number]
  icon: ReactNode
  paid?: boolean
  partial?: boolean
  status?: string
  tone: "red" | "zinc"
}) {
  return (
    <Link
      href={`/agenda/${appointment.id}`}
      className="grid gap-3 p-4 transition hover:bg-white/5 sm:grid-cols-[44px_1fr_auto] sm:items-center sm:p-5"
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
          tone === "red" ? "bg-red-500/10 text-red-300" : "bg-white/5 text-zinc-300"
        }`}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{appointment.title}</p>
        <p className="mt-1 text-xs font-semibold text-red-200">
          {appointment.orderNumber || "Sem OS"} · {appointment.serviceCount} serviço(s)
        </p>

        <p className="mt-1 truncate text-sm text-zinc-400">
          {appointment.customer.name} · {appointment.vehicle.brand}{" "}
          {appointment.vehicle.model}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {appointment.services.join(" · ")}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
        <p className="text-sm font-semibold text-white">
          {amount || formatDate(appointment.date)}
        </p>
        {status && (
          <p
            className={`mt-1 w-fit rounded-full border px-3 py-1 text-xs font-semibold sm:ml-auto ${
              paid
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                : partial
                  ? "border-sky-400/20 bg-sky-500/10 text-sky-200"
                  : "border-red-400/20 bg-red-500/10 text-red-200"
            }`}
          >
            {status}
          </p>
        )}
      </div>
    </Link>
  )
}
