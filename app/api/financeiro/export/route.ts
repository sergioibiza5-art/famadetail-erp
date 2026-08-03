import { NextRequest } from "next/server"
import { WorkerAccount } from "@prisma/client"
import { requireAdmin } from "@/lib/auth"
import { formatMoney, getPaidAmount, missingMoney } from "@/lib/finance"
import { prisma } from "@/lib/prisma"

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "")
  return `"${text.replaceAll('"', '""')}"`
}

function accountLabel(account: WorkerAccount) {
  switch (account) {
    case "JOAO":
      return "Sérgio"
    case "ADRIANA":
      return "Adriana"
    case "FAMADETAIL":
      return "FamaDetail"
    default:
      return account
  }
}

export async function GET(request: NextRequest) {
  await requireAdmin()

  const accountParam = request.nextUrl.searchParams.get("account")?.toUpperCase()
  const account = Object.values(WorkerAccount).includes(accountParam as WorkerAccount)
    ? (accountParam as WorkerAccount)
    : null

  const [splits, movements] = await Promise.all([
    prisma.financialSplit.findMany({
      where: account ? { account } : undefined,
      include: {
        appointment: {
          include: {
            customer: true,
            vehicle: true,
            serviceTemplate: true,
          },
        },
      },
      orderBy: {
        appointment: {
          date: "desc",
        },
      },
    }),
    prisma.paymentMovement.findMany({
      where: account ? { account } : undefined,
      orderBy: { paidAt: "desc" },
    }),
  ])

  const splitRows = splits.map((split) => {
    const paid = getPaidAmount(split)

    return [
      "serviço",
      accountLabel(split.account),
      split.appointment.serviceTemplate?.name || split.appointment.title,
      split.appointment.customer.name,
      split.appointment.vehicle.plate,
      split.appointment.date.toISOString(),
      formatMoney(split.amount),
      formatMoney(paid),
      formatMoney(missingMoney(split.amount, paid)),
      `${split.percentage.toFixed(2)}%`,
      split.isPaid ? "Pago" : "Por pagar",
      "",
    ]
  })

  const movementRows = movements.map((movement) => [
    "pagamento",
    accountLabel(movement.account),
    movement.notes || "Pagamento",
    "",
    "",
    movement.paidAt.toISOString(),
    "",
    formatMoney(movement.amount),
    "",
    "",
    "",
    movement.method || "",
  ])

  const rows = [
    [
      "tipo",
      "conta",
      "descrição",
      "cliente",
      "matricula",
      "data",
      "valor",
      "pago",
      "falta",
      "percentagem",
      "estado",
      "metodo",
    ],
    ...splitRows,
    ...movementRows,
  ]

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n")

  return new Response(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="financeiro${account ? `-${account}` : ""}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  })
}
