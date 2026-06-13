import { AppointmentStatus, PrismaClient } from "@prisma/client"
import { quietly, sendAppointmentConfirmationEmail } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

export async function updateAppointmentStatusWithStock(
  appointmentId: string,
  status: AppointmentStatus
) {
  let shouldSendConfirmation = false

  await prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true },
    })

    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status },
    })

    shouldSendConfirmation =
      status === "CONFIRMED" && existing?.status !== "CONFIRMED"

    if (status !== "COMPLETED") return

    await applyAppointmentStockConsumption(tx, appointmentId)
  })

  if (shouldSendConfirmation) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
    })

    if (appointment) {
      await quietly(sendAppointmentConfirmationEmail(appointment))
    }
  }
}

async function applyAppointmentStockConsumption(
  tx: PrismaTx,
  appointmentId: string
) {
  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      serviceTemplate: {
        include: {
          productUsages: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  })

  if (!appointment || appointment.stockDeductedAt) return

  const usages = appointment.serviceTemplate?.productUsages || []
  if (usages.length === 0) {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { stockDeductedAt: new Date() },
    })
    return
  }

  for (const usage of usages) {
    const quantity = Math.abs(usage.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    await tx.stockMovement.create({
      data: {
        productId: usage.productId,
        appointmentId,
        serviceTemplateId: appointment.serviceTemplateId,
        quantity: -quantity,
        notes: `Consumo automatico: ${appointment.title}`,
      },
    })

    await tx.product.update({
      where: { id: usage.productId },
      data: {
        stock: {
          decrement: quantity,
        },
      },
    })
  }

  await tx.appointment.update({
    where: { id: appointmentId },
    data: { stockDeductedAt: new Date() },
  })
}
