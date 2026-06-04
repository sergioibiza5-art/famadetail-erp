import { NextResponse } from "next/server"
import { PhotoType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const vehicleId = String(body.vehicleId || "")
    const appointmentId = body.appointmentId
      ? String(body.appointmentId)
      : null
    const imageUrl = String(body.imageUrl || "")
    const type = String(body.type || "")

    if (!vehicleId || !imageUrl || !["BEFORE", "AFTER"].includes(type)) {
      return NextResponse.json(
        {
          error: "Dados invalidos",
        },
        {
          status: 400,
        }
      )
    }

    const photoType = type as PhotoType

    await prisma.$transaction([
      prisma.vehiclePhoto.create({
        data: {
          vehicleId,
          appointmentId,
          imageUrl,
          type: photoType,
        },
      }),
      prisma.vehicleTimeline.create({
        data: {
          vehicleId,
          title:
            photoType === PhotoType.BEFORE
              ? "Fotos antes adicionadas"
              : "Fotos depois adicionadas",
          description:
            photoType === PhotoType.BEFORE
              ? "Novas fotografias antes do servico"
              : "Novas fotografias finais do servico",
          type:
            photoType === PhotoType.BEFORE
              ? "BEFORE_PHOTOS"
              : "AFTER_PHOTOS",
        },
      }),
    ])

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        error: "Erro interno",
      },
      {
        status: 500,
      }
    )
  }
}
