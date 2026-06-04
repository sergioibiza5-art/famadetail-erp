import type { AppSettings } from "@prisma/client"
import { getDaySchedule } from "@/lib/settings"

export type BusyInterval = {
  start: Date
  end: Date
}

export type BookingService = {
  durationMinutes: number
}

export type BookingSegment = {
  start: Date
  end: Date
  minutes: number
}

export type BookingPlan = {
  start: Date
  end: Date
  totalMinutes: number
  segments: BookingSegment[]
  spansMultipleDays: boolean
}

const dayMs = 24 * 60 * 60 * 1000

export function dateAtTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number)

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0
  )
}

export function formatReadyDate(date: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function getTotalServiceMinutes(services: BookingService[]) {
  return services.reduce((sum, service) => sum + service.durationMinutes, 0)
}

export function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB
}

export function planBookingWork(
  settings: AppSettings,
  start: Date,
  totalMinutes: number,
  options: { allowMoveToNextWindow?: boolean } = {}
): BookingPlan | null {
  if (totalMinutes <= 0) return null

  const firstSchedule = getDaySchedule(settings, start)
  if (!firstSchedule.enabled) return null

  const firstOpen = dateAtTime(start, firstSchedule.openTime)
  const firstClose = dateAtTime(start, firstSchedule.closeTime)
  if (!options.allowMoveToNextWindow && (start < firstOpen || start >= firstClose)) {
    return null
  }

  let cursor = new Date(start)
  let remaining = totalMinutes
  const segments: BookingSegment[] = []
  let guard = 0

  while (remaining > 0 && guard < 90) {
    guard += 1
    const schedule = getDaySchedule(settings, cursor)

    if (!schedule.enabled) {
      cursor = nextDayStart(cursor, settings)
      continue
    }

    const open = dateAtTime(cursor, schedule.openTime)
    const close = dateAtTime(cursor, schedule.closeTime)

    if (cursor < open) cursor = open

    if (cursor >= close) {
      cursor = nextDayStart(cursor, settings)
      continue
    }

    const availableMinutes = Math.floor(
      (close.getTime() - cursor.getTime()) / 60000
    )
    const workMinutes = Math.min(remaining, availableMinutes)
    const segmentEnd = new Date(cursor.getTime() + workMinutes * 60000)

    segments.push({
      start: new Date(cursor),
      end: segmentEnd,
      minutes: workMinutes,
    })

    remaining -= workMinutes
    cursor = segmentEnd

    if (remaining > 0) {
      cursor = nextDayStart(cursor, settings)
    }
  }

  if (remaining > 0 || segments.length === 0) return null

  const end = segments[segments.length - 1].end
  const startDay = dayKey(start)

  return {
    start,
    end,
    totalMinutes,
    segments,
    spansMultipleDays: segments.some((segment) => dayKey(segment.end) !== startDay),
  }
}

export function hasBusyOverlap(plan: BookingPlan, busyIntervals: BusyInterval[]) {
  return plan.segments.some((segment) =>
    busyIntervals.some((busy) => overlaps(segment.start, segment.end, busy.start, busy.end))
  )
}

function nextDayStart(date: Date, settings: AppSettings) {
  let next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)

  for (let i = 0; i < 90; i += 1) {
    const schedule = getDaySchedule(settings, next)
    if (schedule.enabled) {
      return dateAtTime(next, schedule.openTime)
    }

    next = new Date(next.getTime() + dayMs)
  }

  return next
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}
