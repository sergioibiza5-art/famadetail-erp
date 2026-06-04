import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getAppSettings, getDaySchedule } from "@/lib/settings"

function dateAtTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number)

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0
  )
}

export async function POST(request: Request) {
  const settings = await getAppSettings()

  if (!settings.bookingEnabled) {
    return NextResponse.json(
      {
        error: "As marcacoes online estao temporariamente indisponiveis.",
      },
      {
        status: 400,
      }
    )
  }

  const formData = await request.formData()

  const serviceTemplateId = String(formData.get("serviceTemplateId") || "")
  const dateTime = String(formData.get("dateTime") || "")
  const name = String(formData.get("name") || "")
  const phone = String(formData.get("phone") || "")
  const email = String(formData.get("email") || "")
  const brand = String(formData.get("brand") || "")
  const model = String(formData.get("model") || "")
  const plate = String(formData.get("plate") || "").toUpperCase()
  const needsPickup = String(formData.get("needsPickup") || "NO")
  const pickupAddress = String(formData.get("pickupAddress") || "")
  const notes = String(formData.get("notes") || "")

  if (!serviceTemplateId || !dateTime || !name || !phone || !brand || !model || !plate) {
    return NextResponse.json(
      {
        error: "Preencha os campos obrigatorios.",
      },
      {
        status: 400,
      }
    )
  }

  const service = await prisma.serviceTemplate.findUnique({
    where: {
      id: serviceTemplateId,
    },
  })

  if (!service || !service.isActive) {
    return NextResponse.json(
      {
        error: "Servico indisponivel.",
      },
      {
        status: 400,
      }
    )
  }

  if (needsPickup === "YES" && (!settings.pickupEnabled || !pickupAddress)) {
    return NextResponse.json(
      {
        error: "Indique a morada para levantamento e entrega.",
      },
      {
        status: 400,
      }
    )
  }

  const startDate = new Date(dateTime)
  const endDate = new Date(
    startDate.getTime() + service.durationMinutes * 60 * 1000
  )
  const schedule = getDaySchedule(settings, startDate)

  if (!schedule.enabled) {
    return NextResponse.json(
      {
        error: "Dia indisponivel para marcacao.",
      },
      {
        status: 400,
      }
    )
  }

  const open = dateAtTime(startDate, schedule.openTime)
  const close = dateAtTime(startDate, schedule.closeTime)

  if (startDate < open || endDate > close) {
    return NextResponse.json(
      {
        error: "Horario fora da faixa disponivel.",
      },
      {
        status: 400,
      }
    )
  }

  const overlap = await prisma.appointment.findFirst({
    where: {
      status: {
        notIn: ["COMPLETED", "CANCELLED"],
      },
      date: {
        lt: endDate,
      },
      OR: [
        {
          endDate: {
            gt: startDate,
          },
        },
        {
          endDate: null,
        },
      ],
    },
  })

  if (overlap) {
    return NextResponse.json(
      {
        error: "Este horario acabou de ficar indisponivel.",
      },
      {
        status: 409,
      }
    )
  }

  const customer =
    (await prisma.customer.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    })) ||
    (await prisma.customer.create({
      data: {
        name,
        phone,
        email: email || null,
      },
    }))

  const existingVehicle = await prisma.vehicle.findUnique({
    where: {
      plate,
    },
  })

  const vehicle =
    existingVehicle ||
    (await prisma.vehicle.create({
      data: {
        brand,
        model,
        plate,
        customerId: customer.id,
      },
    }))

  const appointmentNotes = [
    "Pedido criado pela pagina publica.",
    needsPickup === "YES"
      ? `Levantamento e entrega ao domicilio: SIM. Morada: ${pickupAddress}`
      : "Levantamento e entrega ao domicilio: NAO.",
    notes ? `Notas do cliente: ${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  await prisma.appointment.create({
    data: {
      title: service.name,
      date: startDate,
      endDate,
      status: "PENDING",
      notes: appointmentNotes,
      customerId: customer.id,
      vehicleId: vehicle.id,
      serviceTemplateId: service.id,
    },
  })

  revalidatePath("/agenda")
  revalidatePath("/dashboard")

  return NextResponse.json({
    success: true,
  })
}
