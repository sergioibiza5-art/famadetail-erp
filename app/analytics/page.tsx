import Link from "next/link"
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle,
  CreditCard,
  Euro,
  Package,
  TrendingUp,
  Users,
} from "lucide-react"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0)
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value || 0)
}

function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
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

function getPaymentLabel(method: string | null) {
  switch (method) {
    case "CASH":
      return "Numerário"
    case "MBWAY":
      return "MB Way"
    default:
      return "Por definir"
  }
}

function getStartOfMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function getLastDays(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (days - 1 - index))
    return date
  })
}

type BarRowProps = {
  label: string
  value: string
  percent: number
  detail?: string
}

function BarRow({ label, value, percent, detail }: BarRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{label}</p>
          {detail && <p className="text-xs text-zinc-500">{detail}</p>}
        </div>
        <p className="shrink-0 font-semibold text-red-300">{value}</p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-red-400"
          style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  )
}

export default async function AnalyticsPage() {
  const monthStart = getStartOfMonth()

  const [appointments, customers, vehicles, products, expenses] =
    await Promise.all([
      prisma.appointment.findMany({
        include: {
          customer: true,
          vehicle: true,
          serviceTemplate: true,
        },
        orderBy: {
          date: "desc",
        },
      }),
      prisma.customer.findMany({
        include: {
          appointments: true,
        },
      }),
      prisma.vehicle.count(),
      prisma.product.findMany(),
      prisma.expense.findMany({
        orderBy: {
          createdAt: "desc",
        },
      }),
    ])

  const completedAppointments = appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  )
  const activeAppointments = appointments.filter((appointment) =>
    ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(appointment.status)
  )
  const paidAppointments = completedAppointments.filter(
    (appointment) => appointment.isPaid
  )
  const unpaidCompletedAppointments = completedAppointments.filter(
    (appointment) => !appointment.isPaid
  )

  const completedRevenue = completedAppointments.reduce(
    (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
    0
  )
  const paidRevenue = paidAppointments.reduce(
    (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
    0
  )
  const unpaidRevenue = unpaidCompletedAppointments.reduce(
    (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
    0
  )
  const monthPaidRevenue = paidAppointments
    .filter((appointment) => appointment.date >= monthStart)
    .reduce(
      (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
      0
    )
  const monthExpenses = expenses
    .filter((expense) => expense.createdAt >= monthStart)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const stockValue = products.reduce(
    (sum, product) => sum + product.stock * product.price,
    0
  )
  const lowStockCount = products.filter(
    (product) => product.stock <= product.minStock
  ).length
  const conversionRate =
    appointments.length > 0 ? completedAppointments.length / appointments.length : 0
  const paidRate =
    completedAppointments.length > 0
      ? paidAppointments.length / completedAppointments.length
      : 0

  const statusCounts = ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map(
    (status) => ({
      status,
      count: appointments.filter((appointment) => appointment.status === status)
        .length,
    })
  )
  const maxStatusCount = Math.max(
    1,
    ...statusCounts.map((status) => status.count)
  )

  const paymentCounts = ["CASH", "MBWAY"].map((method) => ({
    method,
    count: paidAppointments.filter(
      (appointment) => appointment.paymentMethod === method
    ).length,
    revenue: paidAppointments
      .filter((appointment) => appointment.paymentMethod === method)
      .reduce(
        (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
        0
      ),
  }))
  const maxPaymentRevenue = Math.max(
    1,
    ...paymentCounts.map((method) => method.revenue)
  )

  const serviceStats = Array.from(
    appointments.reduce((map, appointment) => {
      const key = appointment.serviceTemplate?.name || appointment.title
      const current = map.get(key) || {
        name: key,
        count: 0,
        revenue: 0,
      }

      current.count += 1
      if (appointment.status === "COMPLETED") {
        current.revenue += appointment.serviceTemplate?.price || 0
      }

      map.set(key, current)
      return map
    }, new Map<string, { name: string; count: number; revenue: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
    .slice(0, 6)
  const maxServiceRevenue = Math.max(
    1,
    ...serviceStats.map((service) => service.revenue)
  )

  const customerStats = customers
    .map((customer) => {
      const customerAppointments = appointments.filter(
        (appointment) => appointment.customerId === customer.id
      )
      const revenue = customerAppointments
        .filter((appointment) => appointment.status === "COMPLETED")
        .reduce(
          (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
          0
        )

      return {
        id: customer.id,
        name: customer.name,
        count: customerAppointments.length,
        revenue,
      }
    })
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
    .slice(0, 5)
  const maxCustomerRevenue = Math.max(
    1,
    ...customerStats.map((customer) => customer.revenue)
  )

  const last14Days = getLastDays(14).map((day) => {
    const nextDay = new Date(day)
    nextDay.setDate(day.getDate() + 1)

    const dayAppointments = appointments.filter(
      (appointment) => appointment.date >= day && appointment.date < nextDay
    )
    const dayRevenue = dayAppointments
      .filter((appointment) => appointment.isPaid)
      .reduce(
        (sum, appointment) => sum + (appointment.serviceTemplate?.price || 0),
        0
      )

    return {
      date: day,
      count: dayAppointments.length,
      revenue: dayRevenue,
    }
  })
  const maxDayRevenue = Math.max(1, ...last14Days.map((day) => day.revenue))

  const cards = [
    {
      label: "Receita paga",
      value: formatMoney(paidRevenue),
      detail: `${formatPercent(paidRate)} dos concluídos pagos`,
      icon: Euro,
    },
    {
      label: "Por receber",
      value: formatMoney(unpaidRevenue),
      detail: `${unpaidCompletedAppointments.length} serviço(s) concluído(s)`,
      icon: CreditCard,
    },
    {
      label: "Este mês",
      value: formatMoney(monthPaidRevenue - monthExpenses),
      detail: `${formatMoney(monthPaidRevenue)} pagos · ${formatMoney(
        monthExpenses
      )} despesas`,
      icon: TrendingUp,
    },
    {
      label: "Taxa conclusão",
      value: formatPercent(conversionRate),
      detail: `${completedAppointments.length}/${appointments.length} marcações`,
      icon: CheckCircle,
    },
    {
      label: "Agenda ativa",
      value: activeAppointments.length,
      detail: "Pendentes, confirmadas ou em curso",
      icon: CalendarDays,
    },
    {
      label: "Clientes",
      value: customers.length,
      detail: `${vehicles} carros registados`,
      icon: Users,
    },
    {
      label: "Stock",
      value: formatMoney(stockValue),
      detail: `${lowStockCount} alerta(s) de stock baixo`,
      icon: Package,
    },
    {
      label: "Ticket médio",
      value: formatMoney(
        completedAppointments.length
          ? completedRevenue / completedAppointments.length
          : 0
      ),
      detail: "Média por serviço concluído",
      icon: Activity,
    },
  ]

  return (
    <section className="p-4 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Indicadores financeiros, operação e desempenho da FamaDetail
          </p>
        </div>

        <div className="w-fit rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          Dados em tempo real
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon

          return (
            <div
              key={card.label}
              className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-5"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-400">{card.label}</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">
                    {card.value}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">{card.detail}</p>
                </div>

                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Receita dos últimos 14 dias</h2>
              <p className="text-sm text-zinc-400">
                Apenas valores já marcados como pagos
              </p>
            </div>
          </div>

          <div className="flex h-72 items-end gap-2 rounded-2xl border border-white/10 bg-[#121214] p-4">
            {last14Days.map((day) => {
              const height = Math.max(6, (day.revenue / maxDayRevenue) * 100)

              return (
                <div
                  key={day.date.toISOString()}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                  title={`${formatShortDate(day.date)} · ${formatMoney(
                    day.revenue
                  )}`}
                >
                  <div className="flex flex-1 items-end">
                    <div
                      className="w-full rounded-t-xl bg-red-400"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <p className="truncate text-center text-[10px] text-zinc-500">
                    {formatShortDate(day.date)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-5">
          <h2 className="text-lg font-semibold">Estados da agenda</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Distribuição atual das marcações
          </p>

          <div className="mt-5 space-y-5">
            {statusCounts.map((status) => (
              <BarRow
                key={status.status}
                label={getStatusLabel(status.status)}
                value={String(status.count)}
                percent={(status.count / maxStatusCount) * 100}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-5">
          <h2 className="text-lg font-semibold">Métodos de pagamento</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Receita paga por método
          </p>

          <div className="mt-5 space-y-5">
            {paymentCounts.map((method) => (
              <BarRow
                key={method.method}
                label={getPaymentLabel(method.method)}
                value={formatMoney(method.revenue)}
                detail={`${method.count} pagamento(s)`}
                percent={(method.revenue / maxPaymentRevenue) * 100}
              />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-5">
          <h2 className="text-lg font-semibold">Top serviços</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Serviços com maior receita concluída
          </p>

          <div className="mt-5 space-y-5">
            {serviceStats.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem serviços concluídos.</p>
            ) : (
              serviceStats.map((service) => (
                <BarRow
                  key={service.name}
                  label={service.name}
                  value={formatMoney(service.revenue)}
                  detail={`${service.count} marcação(ões)`}
                  percent={(service.revenue / maxServiceRevenue) * 100}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-5">
          <h2 className="text-lg font-semibold">Top clientes</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Clientes com maior valor concluído
          </p>

          <div className="mt-5 space-y-5">
            {customerStats.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem clientes com histórico.</p>
            ) : (
              customerStats.map((customer) => (
                <Link
                  key={customer.id}
                  href={`/clientes/${customer.id}`}
                  className="block rounded-2xl border border-white/10 bg-[#121214] p-4 transition hover:border-red-400/40"
                >
                  <BarRow
                    label={customer.name}
                    value={formatMoney(customer.revenue)}
                    detail={`${customer.count} marcação(ões)`}
                    percent={(customer.revenue / maxCustomerRevenue) * 100}
                  />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-[#0B0B0C]">
        <div className="border-b border-white/10 p-5">
          <h2 className="text-lg font-semibold">Atenção operacional</h2>
          <p className="text-sm text-zinc-400">
            Pontos que merecem ação rápida
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Link
            href="/agenda"
            className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 transition hover:border-amber-400/40"
          >
            <p className="text-sm font-semibold text-amber-200">Por receber</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {formatMoney(unpaidRevenue)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {unpaidCompletedAppointments.length} serviço(s) concluído(s) sem
              pagamento
            </p>
          </Link>

          <Link
            href="/stock"
            className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4 transition hover:border-rose-400/40"
          >
            <p className="text-sm font-semibold text-rose-200">Stock baixo</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {lowStockCount}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Produto(s) no limite mínimo
            </p>
          </Link>

          <Link
            href="/agenda"
            className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 transition hover:border-red-400/40"
          >
            <p className="text-sm font-semibold text-red-200">Agenda ativa</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {activeAppointments.length}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Trabalho(s) ainda em aberto
            </p>
          </Link>
        </div>
      </div>
    </section>
  )
}
