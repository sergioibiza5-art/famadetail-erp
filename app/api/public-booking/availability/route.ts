import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAppSettings, getDaySchedule } from "@/lib/settings"

function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
) {
  return startA < endB && endA > startB
}

function formatSlot(date: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const serviceTemplateId = searchParams.get("serviceTemplateId") || ""
  const date = searchParams.get("date") || ""

  const settings = await getAppSettings()

  if (!settings.bookingEnabled || !serviceTemplateId || !date) {
    return NextResponse.json({ slots: [] })
  }

  const service = await prisma.serviceTemplate.findUnique({
    where: {
      id: serviceTemplateId,
    },
  })

  if (!service || !service.isActive) {
    return NextResponse.json({ slots: [] })
  }

  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59`)
  const schedule = getDaySchedule(settings, dayStart)
  const open = new Date(`${date}T${schedule.openTime}:00`)
  const close = new Date(`${date}T${schedule.closeTime}:00`)
  const now = new Date()

  if (!schedule.enabled) {
    return NextResponse.json({ slots: [] })
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      status: {
        notIn: ["COMPLETED", "CANCELLED"],
      },
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
    select: {
      date: true,
      endDate: true,
    },
  })

  const slots = []

  for (
    let cursor = new Date(open);
    cursor.getTime() + service.durationMinutes * 60 * 1000 <= close.getTime();
    cursor = new Date(cursor.getTime() + settings.slotStepMinutes * 60 * 1000)
  ) {
    const slotStart = new Date(cursor)
    const slotEnd = new Date(
      slotStart.getTime() + service.durationMinutes * 60 * 1000
    )

    if (slotStart <= now) continue

    const busy = appointments.some((appointment) => {
      const appointmentEnd =
        appointment.endDate ||
        new Date(appointment.date.getTime() + 30 * 60 * 1000)

      return overlaps(slotStart, slotEnd, appointment.date, appointmentEnd)
    })

    if (!busy) {
      slots.push({
        value: slotStart.toISOString(),
        label: formatSlot(slotStart),
      })
    }
  }

  return NextResponse.json({ slots })
}
