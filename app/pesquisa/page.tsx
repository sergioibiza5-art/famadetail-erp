import Link from "next/link"
import type { ComponentType, ReactNode } from "react"
import {
  CalendarDays,
  Car,
  Package,
  Receipt,
  Search,
  User,
  WalletCards,
  Wrench,
} from "lucide-react"
import { WorkerAccount } from "@prisma/client"
import { requireAdmin } from "@/lib/auth"
import { accountLabel, formatMoney } from "@/lib/finance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{ q?: string }>
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

export default async function SearchPage({ searchParams }: Props) {
  await requireAdmin()

  const params = await searchParams
  const q = String(params?.q || "").trim()
  const hasQuery = q.length >= 2
  const matchingAccounts = Object.values(WorkerAccount).filter((account) =>
    `${account} ${accountLabel(account)}`.toLowerCase().includes(q.toLowerCase())
  )

  const [customers, vehicles, appointments, services, products, expenses, movements] = hasQuery
    ? await Promise.all([
        prisma.customer.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 12,
        }),
        prisma.vehicle.findMany({
          where: {
            OR: [
              { plate: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
          include: { customer: true },
          orderBy: { updatedAt: "desc" },
          take: 12,
        }),
        prisma.appointment.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { orderNumber: { contains: q, mode: "insensitive" } },
              { notes: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { customer: { phone: { contains: q, mode: "insensitive" } } },
              { vehicle: { plate: { contains: q, mode: "insensitive" } } },
              { serviceTemplate: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
          include: {
            customer: true,
            vehicle: true,
            serviceTemplate: true,
          },
          orderBy: { date: "desc" },
          take: 12,
        }),
        prisma.serviceTemplate.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 12,
        }),
        prisma.product.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { notes: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 12,
        }),
        prisma.expense.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { notes: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        prisma.paymentMovement.findMany({
          where: {
            OR: [
              { notes: { contains: q, mode: "insensitive" } },
              ...(matchingAccounts.length > 0
                ? matchingAccounts.map((account) => ({ account }))
                : []),
            ],
          },
          orderBy: { paidAt: "desc" },
          take: 12,
        }),
      ])
    : [[], [], [], [], [], [], []]

  const totalResults =
    customers.length +
    vehicles.length +
    appointments.length +
    services.length +
    products.length +
    expenses.length +
    movements.length

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
          Pesquisa
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          Pesquisa global
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Procura por cliente, telefone, matrícula, carro, OS, serviço, produto, despesa ou movimento.
        </p>
      </div>

      <form className="mb-5 flex gap-3 rounded-3xl border border-white/10 bg-[#0B0B0C] p-3">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="Nome, matrícula, telefone, OS, produto..."
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-300/60"
          />
        </label>
        <button className="rounded-2xl bg-zinc-100 px-5 py-3 text-sm font-black text-black transition hover:bg-white">
          Procurar
        </button>
      </form>

      {!hasQuery ? (
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-8 text-center text-sm text-zinc-500">
          Escreve pelo menos 2 caracteres para pesquisar.
        </div>
      ) : totalResults === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-8 text-center text-sm text-zinc-500">
          Nenhum resultado para {q}.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <ResultSection title="Clientes" icon={User} count={customers.length}>
            {customers.map((customer) => (
              <ResultLink key={customer.id} href={`/clientes/${customer.id}`}>
                <span className="font-semibold text-white">{customer.name}</span>
                <span className="text-sm text-zinc-400">
                  {[customer.phone, customer.email].filter(Boolean).join(" · ") || "Sem contacto"}
                </span>
              </ResultLink>
            ))}
          </ResultSection>

          <ResultSection title="Carros" icon={Car} count={vehicles.length}>
            {vehicles.map((vehicle) => (
              <ResultLink key={vehicle.id} href={`/carros/${vehicle.id}`}>
                <span className="font-semibold text-white">
                  {vehicle.brand} {vehicle.model}
                </span>
                <span className="text-sm text-zinc-400">
                  {vehicle.plate} · {vehicle.customer.name}
                </span>
              </ResultLink>
            ))}
          </ResultSection>

          <ResultSection title="Marcações" icon={CalendarDays} count={appointments.length}>
            {appointments.map((appointment) => (
              <ResultLink key={appointment.id} href={`/agenda/${appointment.id}`}>
                <span className="font-semibold text-white">
                  {appointment.serviceTemplate?.name || appointment.title}
                </span>
                <span className="text-sm text-zinc-400">
                  {appointment.orderNumber || "Sem OS"} · {appointment.customer.name} · {appointment.vehicle.plate} · {formatDate(appointment.date)}
                </span>
              </ResultLink>
            ))}
          </ResultSection>

          <ResultSection title="Serviços" icon={Wrench} count={services.length}>
            {services.map((service) => (
              <ResultLink key={service.id} href={`/servicos/${service.id}`}>
                <span className="font-semibold text-white">{service.name}</span>
                <span className="text-sm text-zinc-400">
                  {formatMoney(service.price)} · {service.durationMinutes} min
                </span>
              </ResultLink>
            ))}
          </ResultSection>

          <ResultSection title="Produtos" icon={Package} count={products.length}>
            {products.map((product) => (
              <ResultLink key={product.id} href={`/stock/${product.id}`}>
                <span className="font-semibold text-white">{product.name}</span>
                <span className="text-sm text-zinc-400">
                  Stock: {product.stock} {product.unit || "un"} · mínimo: {product.minStock}
                </span>
              </ResultLink>
            ))}
          </ResultSection>

          <ResultSection title="Despesas" icon={Receipt} count={expenses.length}>
            {expenses.map((expense) => (
              <ResultLink key={expense.id} href="/despesas">
                <span className="font-semibold text-white">{expense.title}</span>
                <span className="text-sm text-zinc-400">
                  {formatMoney(expense.amount)} · {formatDate(expense.createdAt)}
                </span>
              </ResultLink>
            ))}
          </ResultSection>

          <ResultSection title="Movimentos" icon={WalletCards} count={movements.length}>
            {movements.map((movement) => (
              <ResultLink
                key={movement.id}
                href={`/financeiro/movimentos?account=${movement.account}`}
              >
                <span className="font-semibold text-white">
                  {accountLabel(movement.account)} · {movement.notes || "Pagamento"}
                </span>
                <span className="text-sm text-zinc-400">
                  {formatMoney(movement.amount)} · {formatDate(movement.paidAt)}
                </span>
              </ResultLink>
            ))}
          </ResultSection>
        </div>
      )}
    </section>
  )
}

function ResultSection({
  children,
  count,
  icon: Icon,
  title,
}: {
  children: ReactNode
  count: number
  icon: ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
            <Icon className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300">
          {count}
        </span>
      </div>
      <div className="divide-y divide-white/10">
        {count === 0 ? <p className="p-6 text-sm text-zinc-500">Sem resultados.</p> : children}
      </div>
    </div>
  )
}

function ResultLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 p-4 transition hover:bg-white/[0.03]"
    >
      {children}
    </Link>
  )
}