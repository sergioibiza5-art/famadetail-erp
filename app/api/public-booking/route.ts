import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import {
  getTotalServiceMinutes,
  hasBusyOverlap,
  planBookingWork,
} from "@/lib/booking-schedule"
import { prisma } from "@/lib/prisma"
import { getAppSettings } from "@/lib/settings"

function getRequestedServiceIds(formData: FormData) {
  const ids = [
    ...formData.getAll("serviceTemplateIds").map(String),
    ...formData.getAll("serviceTemplateId").map(String),
    String(formData.get("serviceTemplateIds") || "").split(","),
  ].flat()

  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
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

  const serviceIds = getRequestedServiceIds(formData)
  const dateTime = String(formData.get("dateTime") || "")
  const name = String(formData.get("name") || "").trim()
  const phone = String(formData.get("phone") || "").trim()
  const email = String(formData.get("email") || "").trim()
  const brand = String(formData.get("brand") || "").trim()
  const model = String(formData.get("model") || "").trim()
  const plate = String(formData.get("plate") || "").trim().toUpperCase()
  const needsPickup = String(formData.get("needsPickup") || "NO")
  const pickupAddress = String(formData.get("pickupAddress") || "").trim()
  const notes = String(formData.get("notes") || "").trim()

  if (
    serviceIds.length === 0 ||
    !dateTime ||
    !name ||
    (!phone && !email) ||
    !brand ||
    !model ||
    !plate
  ) {
    return NextResponse.json(
      {
        error: "Preencha os campos obrigatorios e indique telemovel ou email.",
      },
      {
        status: 400,
      }
    )
  }

  const services = await prisma.serviceTemplate.findMany({
    where: {
      id: {
        in: serviceIds,
      },
      isActive: true,
      publicBookingEnabled: true,
    },
  })

  if (services.length !== serviceIds.length) {
    return NextResponse.json(
      {
        error: "Um dos servicos selecionados nao esta disponivel.",
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

  const orderedServices = serviceIds
    .map((id) => services.find((service) => service.id === id))
    .filter((service): service is (typeof services)[number] => Boolean(service))

  const startDate = new Date(dateTime)
  const totalMinutes = getTotalServiceMinutes(orderedServices)
  const plan = planBookingWork(settings, startDate, totalMinutes)

  if (!plan) {
    return NextResponse.json(
      {
        error: "Horario fora da faixa disponivel.",
      },
      {
        status: 400,
      }
    )
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      status: {
        notIn: ["COMPLETED", "CANCELLED"],
      },
      date: {
        lt: plan.end,
      },
      OR: [
        {
          endDate: {
            gt: plan.start,
          },
        },
        {
          endDate: null,
        },
      ],
    },
    select: {
      date: true,
      endDate: true,
    },
  })

  const busyIntervals = appointments.map((appointment) => ({
    start: appointment.date,
    end:
      appointment.endDate ||
      new Date(appointment.date.getTime() + settings.slotStepMinutes * 60000),
  }))

  if (hasBusyOverlap(plan, busyIntervals)) {
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
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
      },
    })) ||
    (await prisma.customer.create({
      data: {
        name,
        phone: phone || null,
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

  const serviceNames = orderedServices.map((service) => service.name).join(", ")
  const appointmentNotes = [
    "Pedido criado pela pagina publica.",
    `Servicos pedidos: ${serviceNames}.`,
    plan.spansMultipleDays
      ? "Aviso mostrado ao cliente: este pedido pode demorar mais de 1 dia de trabalho."
      : "",
    needsPickup === "YES"
      ? `Levantamento e entrega ao domicilio: SIM. Morada: ${pickupAddress}`
      : "Levantamento e entrega ao domicilio: NAO.",
    notes ? `Notas do cliente: ${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const groupId = orderedServices.length > 1 ? randomUUID() : null
  let cursor = new Date(startDate)

  await prisma.$transaction(
    orderedServices.map((service, index) => {
      const servicePlan = planBookingWork(settings, cursor, service.durationMinutes, {
        allowMoveToNextWindow: index > 0,
      })
      if (!servicePlan) {
        throw new Error("Nao foi possivel calcular a duracao do servico.")
      }

      cursor = servicePlan.end

      return prisma.appointment.create({
        data: {
          title: service.name,
          date: servicePlan.start,
          endDate: servicePlan.end,
          status: "PENDING",
          notes: appointmentNotes,
          customerId: customer.id,
          vehicleId: vehicle.id,
          serviceTemplateId: service.id,
          groupId,
          serviceIndex: index + 1,
          serviceTotal: orderedServices.length,
        },
      })
    })
  )

  revalidatePath("/agenda")
  revalidatePath("/dashboard")

  return NextResponse.json({
    success: true,
    message:
      "Marcacao submetida. Depois da equipa confirmar, recebe a confirmacao no telemovel indicado ou por email se nao tiver telemovel.",
  })
}
