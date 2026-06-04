import { prisma } from "@/lib/prisma"

type Settings = Awaited<ReturnType<typeof getAppSettings>>

export async function getAppSettings() {
  return prisma.appSettings.upsert({
    where: {
      id: "default",
    },
    update: {},
    create: {
      id: "default",
    },
  })
}

export function getDaySchedule(settings: Settings, date: Date) {
  const day = date.getDay()

  switch (day) {
    case 0:
      return {
        enabled: settings.sunday,
        openTime: settings.sundayOpenTime,
        closeTime: settings.sundayCloseTime,
      }
    case 1:
      return {
        enabled: settings.monday,
        openTime: settings.mondayOpenTime,
        closeTime: settings.mondayCloseTime,
      }
    case 2:
      return {
        enabled: settings.tuesday,
        openTime: settings.tuesdayOpenTime,
        closeTime: settings.tuesdayCloseTime,
      }
    case 3:
      return {
        enabled: settings.wednesday,
        openTime: settings.wednesdayOpenTime,
        closeTime: settings.wednesdayCloseTime,
      }
    case 4:
      return {
        enabled: settings.thursday,
        openTime: settings.thursdayOpenTime,
        closeTime: settings.thursdayCloseTime,
      }
    case 5:
      return {
        enabled: settings.friday,
        openTime: settings.fridayOpenTime,
        closeTime: settings.fridayCloseTime,
      }
    case 6:
      return {
        enabled: settings.saturday,
        openTime: settings.saturdayOpenTime,
        closeTime: settings.saturdayCloseTime,
      }
    default:
      return {
        enabled: false,
        openTime: "09:00",
        closeTime: "18:00",
      }
  }
}

export function isWorkingDay(settings: Settings, date: Date) {
  return getDaySchedule(settings, date).enabled
}
