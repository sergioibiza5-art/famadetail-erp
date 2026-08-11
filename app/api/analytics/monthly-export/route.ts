import { NextRequest } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { FINANCE_MOVEMENT_START_DATE, formatMoney } from "@/lib/finance"
import { prisma } from "@/lib/prisma"

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "")
  return `"${text.replaceAll('"', '""')}"`
}

function monthRange(request: NextRequest) {
  const monthParam = request.nextUrl.searchParams.get("month")
  const base = monthParam ? new Date(`${monthParam}-01T00:00:00`) : new Date()
  const start = new Date(base.getFullYear(), base.getMonth(), 1)
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1)

  return { start, end }
}

export async function GET(request: NextRequest) {
  await requireAdmin()

  const { start, end } = monthRange(request)
  const activeStart =
    start > FINANCE_MOVEMENT_START_DATE ? start : FINANCE_MOVEMENT_START_DATE
  const [appointments, movements, expenses] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        date: {
          gte: activeStart,
          lt: end,
        },
      },
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.paymentMovement.findMany({
      where: {
        paidAt: {
          gte: activeStart,
          lt: end,
        },
      },
      orderBy: { paidAt: "asc" },
    }),
    prisma.expense.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const generated = appointments
    .filter((appointment) => appointment.status === "COMPLETED")
    .reduce((sum, appointment) => sum + (appointment.serviceTemplate?.price || 0), 0)
  const received = movements.reduce((sum, movement) => sum + movement.amount, 0)
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const profit = received - spent

  const rows = [
    ["tipo", "data", "descricao", "cliente", "matricula", "os", "valor"],
    ["resumo", start.toISOString().slice(0, 10), "Gerado", "", "", "", formatMoney(generated)],
    ["resumo", start.toISOString().slice(0, 10), "Recebido", "", "", "", formatMoney(received)],
    ["resumo", start.toISOString().slice(0, 10), "Despesas", "", "", "", formatMoney(spent)],
    ["resumo", start.toISOString().slice(0, 10), "Lucro estimado", "", "", "", formatMoney(profit)],
    ...appointments.map((appointment) => [
      "servico",
      appointment.date.toISOString(),
      appointment.serviceTemplate?.name || appointment.title,
      appointment.customer.name,
      appointment.vehicle.plate || "",
      appointment.orderNumber || "",
      formatMoney(appointment.serviceTemplate?.price || 0),
    ]),
    ...movements.map((movement) => [
      "pagamento",
      movement.paidAt.toISOString(),
      movement.notes || movement.account,
      "",
      "",
      "",
      formatMoney(movement.amount),
    ]),
    ...expenses.map((expense) => [
      "despesa",
      expense.createdAt.toISOString(),
      expense.title,
      "",
      "",
      "",
      formatMoney(expense.amount),
    ]),
  ]

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n")
  const fileMonth = start.toISOString().slice(0, 7)

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="analytics-${fileMonth}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  })
}
