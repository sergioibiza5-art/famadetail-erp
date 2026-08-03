import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  await requireAdmin()

  const [
    customers,
    vehicles,
    appointments,
    serviceTemplates,
    products,
    stockMovements,
    financialSplits,
    paymentMovements,
    expenses,
    settings,
  ] = await Promise.all([
    prisma.customer.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.appointment.findMany({ orderBy: { date: "asc" } }),
    prisma.serviceTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.product.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.stockMovement.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.financialSplit.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.paymentMovement.findMany({ orderBy: { paidAt: "asc" } }),
    prisma.expense.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.appSettings.findMany(),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    data: {
      customers,
      vehicles,
      appointments,
      serviceTemplates,
      products,
      stockMovements,
      financialSplits,
      paymentMovements,
      expenses,
      settings,
    },
  }

  return Response.json(payload, {
    headers: {
      "Content-Disposition": 'attachment; filename="famadetail-backup.json"',
    },
  })
}
