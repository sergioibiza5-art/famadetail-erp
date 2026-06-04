import { NextResponse } from "next/server"
import {
  formatReadyDate,
  getTotalServiceMinutes,
  hasBusyOverlap,
  planBookingWork,
} from "@/lib/booking-schedule"
import { prisma } from "@/lib/prisma"
import { getAppSettings, getDaySchedule } from "@/lib/settings"

function formatSlot(date: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function getRequestedServiceIds(searchParams: URLSearchParams) {
  const ids = [
    ...searchParams.getAll("serviceTemplateIds"),
    ...searchParams.getAll("serviceTemplateId"),
    ...(searchParams.get("serviceTemplateIds") || "").split(","),
  ]

  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const serviceIds = getRequestedServiceIds(searchParams)
  const date = searchParams.get("date") || ""

  const settings = await getAppSettings()

  if (!settings.bookingEnabled || serviceIds.length === 0 || !date) {
    return NextResponse.json({ slots: [] })
  }

  const services = await prisma.serviceTemplate.findMany({
    where: {
      id: {
        in: serviceIds,
      },
      isActive: true,
      publicBookingEnabled: true,
    },
    select: {
      id: true,
      durationMinutes: true,
    },
  })

  if (services.length !== serviceIds.length) {
    return NextResponse.json({ slots: [] })
  }

  const orderedServices = serviceIds
    .map((id) => services.find((service) => service.id === id))
    .filter((service): service is (typeof services)[number] => Boolean(service))

  const totalMinutes = getTotalServiceMinutes(orderedServices)
  const dayStart = new Date(`${date}T00:00:00`)
  const schedule = getDaySchedule(settings, dayStart)
  const open = new Date(`${date}T${schedule.openTime}:00`)
  const close = new Date(`${date}T${schedule.closeTime}:00`)
  const now = new Date()

  if (!schedule.enabled || totalMinutes <= 0) {
    return NextResponse.json({ slots: [] })
  }

  const horizon = new Date(dayStart.getTime() + 90 * 24 * 60 * 60 * 1000)
  const appointments = await prisma.appointment.findMany({
    where: {
      status: {
        notIn: ["COMPLETED", "CANCELLED"],
      },
      date: {
        lt: horizon,
      },
      OR: [
        {
          endDate: {
            gt: dayStart,
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

  const slots = []

  for (
    let cursor = new Date(open);
    cursor < close;
    cursor = new Date(cursor.getTime() + settings.slotStepMinutes * 60000)
  ) {
    const slotStart = new Date(cursor)
    if (slotStart <= now) continue

    const plan = planBookingWork(settings, slotStart, totalMinutes)
    if (!plan) continue
    if (hasBusyOverlap(plan, busyIntervals)) continue

    slots.push({
      value: slotStart.toISOString(),
      label: formatSlot(slotStart),
      readyAt: plan.end.toISOString(),
      readyLabel: formatReadyDate(plan.end),
      spansMultipleDays: plan.spansMultipleDays,
    })
  }

  return NextResponse.json({ slots })
}
