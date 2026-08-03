import { PrismaClient } from "@prisma/client"

type PrismaLike = Pick<PrismaClient, "appCounter">

export async function nextServiceOrderNumber(
  prisma: PrismaLike,
  date = new Date()
) {
  const year = date.getFullYear()
  const key = `service-order-${year}`
  const counter = await prisma.appCounter.upsert({
    where: { key },
    update: {
      value: {
        increment: 1,
      },
    },
    create: {
      key,
      value: 1,
    },
  })

  return `OS-${year}-${String(counter.value).padStart(4, "0")}`
}
