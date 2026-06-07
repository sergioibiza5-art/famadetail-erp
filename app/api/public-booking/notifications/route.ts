import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const [pendingCount, latestRequest] = await Promise.all([
    prisma.appointment.count({
      where: {
        status: "PENDING",
        notes: {
          contains: "Pedido criado pela pagina publica.",
        },
      },
    }),
    prisma.appointment.findFirst({
      where: {
        status: "PENDING",
        notes: {
          contains: "Pedido criado pela pagina publica.",
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
