import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { Appointment, Customer, Prisma, Vehicle } from "@prisma/client"
import {
  getTotalServiceMinutes,
  hasBusyOverlap,
  planBookingWork,
} from "@/lib/booking-schedule"
import { notifyNewPublicBookingTelegram, quietly } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { getAppSettings } from "@/lib/settings"

class BookingRequestError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

function isSerializableConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  )
}

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
        error: "As marcações online estão temporariamente indisponíveis.",
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
    !email ||
    !brand ||
    !model ||
    !plate
  ) {
    return NextResponse.json(
      {
        error: "Preencha os campos obrigatorios e indique um email valido.",
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
        error: "Um dos serviços selecionados não está disponível.",
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
        error: "Horário fora da faixa disponível.",
      },
      {
        status: 400,
      }
    )
  }

  const serviceNames = orderedServices.map((service) => service.name).join(", ")
  const appointmentNotes = [
    "Pedido criado pela página pública.",
    `Serviços pedidos: ${serviceNames}.`,
    plan.spansMultipleDays
      ? "Aviso mostrado ao cliente: este pedido pode demorar mais de 1 dia de trabalho."
      : "",
    needsPickup === "YES"
      ? `Levantamento e entrega ao domicílio: SIM. Morada: ${pickupAddress}`
      : "Levantamento e entrega ao domicílio: NAO.",
    notes ? `Notas do cliente: ${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const groupId = orderedServices.length > 1 ? randomUUID() : null
  let bookingResult:
    | {
        customer: Customer
        vehicle: Vehicle
        createdAppointments: Appointment[]
      }
    | null = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      bookingResult = await prisma.$transaction(
        async (tx) => {
          const appointments = await tx.appointment.findMany({
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
            throw new BookingRequestError(
              "Este horário acabou de ficar indisponível.",
              409
            )
          }

          let customer =
            (await tx.customer.findFirst({
              where: {
                OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
              },
            })) ||
            (await tx.customer.create({
              data: {
                name,
                phone: phone || null,
                email: email || null,
              },
            }))

          if (customer.email !== email || (phone && customer.phone !== phone)) {
            customer = await tx.customer.update({
              where: { id: customer.id },
              data: {
                email,
                phone: phone || customer.phone,
              },
            })
          }

          const vehicle = await tx.vehicle.upsert({
            where: {
              plate,
            },
            update: {},
            create: {
              brand,
              model,
              plate,
              customerId: customer.id,
            },
          })

          const createdAppointments: Appointment[] = []
          let cursor = new Date(startDate)

          for (let index = 0; index < orderedServices.length; index += 1) {
            const service = orderedServices[index]
            const servicePlan = planBookingWork(
              settings,
              cursor,
              service.durationMinutes,
              {
                allowMoveToNextWindow: index > 0,
              }
            )

            if (!servicePlan) {
              throw new BookingRequestError(
                "Não foi possível calcular a duração do serviço.",
                400
              )
            }

            cursor = servicePlan.end

            createdAppointments.push(
              await tx.appointment.create({
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
            )
          }

          return { customer, vehicle, createdAppointments }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      )
      break
    } catch (error) {
      if (error instanceof BookingRequestError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }

      if (attempt < 2 && isSerializableConflict(error)) {
        continue
      }

      throw error
    }
  }

  if (!bookingResult) {
    return NextResponse.json(
      {
        error: "Não foi possível criar a marcação. Tente novamente.",
      },
      {
        status: 409,
      }
    )
  }

  revalidatePath("/agenda")
  revalidatePath("/dashboard")

  await quietly(
    notifyNewPublicBookingTelegram({
      appointments: bookingResult.createdAppointments.map((appointment, index) => ({
        ...appointment,
        customer: bookingResult.customer,
        vehicle: bookingResult.vehicle,
        serviceTemplate: orderedServices[index],
      })),
    })
  )

  return NextResponse.json({
    success: true,
    message:
      "Marcação submetida. Depois da equipa confirmar, recebe a confirmação no email indicado.",
  })
}
