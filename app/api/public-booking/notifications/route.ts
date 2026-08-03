import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireAdmin()

  const [pendingCount, latestRequest] = await Promise.all([
    prisma.appointment.count({
      where: {
        status: "PENDING",
        notes: {
          contains: "Pedido criado pela p",
        },
      },
    }),
    prisma.appointment.findFirst({
      where: {
        status: "PENDING",
        notes: {
          contains: "Pedido criado pela p",
        },
      },
      select: {
        id: true,
        title: true,
        date: true,
        createdAt: true,
        customer: {
          select: {
            name: true,
          },
        },
        vehicle: {
          select: {
            brand: true,
            model: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ])

  return NextResponse.json({
    pendingCount,
    latestRequest,
  })
}
