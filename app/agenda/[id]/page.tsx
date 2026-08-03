import Link from "next/link"
import { randomUUID } from "node:crypto"
import { notFound, redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { AppointmentStatus, PaymentMethod, WorkerAccount } from "@prisma/client"
import {
  ArrowLeft,
  CalendarDays,
  Car,
  CheckCircle,
  CreditCard,
  Euro,
  Mail,
  Plus,
  Save,
  Trash2,
  User,
  Users,
} from "lucide-react"
import { ConfirmSubmitButton } from "@/components/confirm-submit-button"
import { PhotoGallery } from "@/components/photo-gallery"
import { VehiclePhotoUpload } from "@/components/vehicle-photo-upload"
import { updateAppointmentStatusWithStock } from "@/lib/appointment-stock"
import { requireAdmin } from "@/lib/auth"
import {
  getPaidAmount,
  isMoneyPaid,
  missingMoney,
  redistributeAccountCredit,
  roundMoney,
} from "@/lib/finance"
import { quietly, sendVehicleReadyEmail } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { nextServiceOrderNumber } from "@/lib/service-order"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ id: string }>
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}

function statusLabel(status: AppointmentStatus) {
  switch (status) {
    case "PENDING":
      return "Pendente"
    case "CONFIRMED":
      return "Confirmada"
    case "IN_PROGRESS":
      return "Em curso"
    case "COMPLETED":
      return "Concluída"
    case "CANCELLED":
      return "Cancelada"
    default:
      return status
  }
}

function methodLabel(method: PaymentMethod | null) {
  if (method === "CASH") return "Numerário"
  if (method === "MBWAY") return "MB Way"
  return "Sem metodo"
}

function workerLabel(worker: WorkerAccount) {
  switch (worker) {
    case "JOAO":
      return "Sérgio"
    case "ADRIANA":
      return "Adriana"
    case "FAMADETAIL":
      return "FamaDetail"
    default:
      return worker
  }
}

function getSplitPaidAmount(split: { paidAmount: number; isPaid: boolean; amount: number }) {
  return getPaidAmount(split)
}

const defaultFinancePercentages: Record<WorkerAccount, number> = {
  [WorkerAccount.JOAO]: 50,
  [WorkerAccount.ADRIANA]: 25,
  [WorkerAccount.FAMADETAIL]: 25,
}

function getDefaultFinancePercentage(account: WorkerAccount) {
  return defaultFinancePercentages[account] ?? 0
}

function getFinancePercentagesFromSplits(
  splits: Array<{ account: WorkerAccount; percentage: number }>
) {
  return Object.values(WorkerAccount).map((account) => {
    const split = splits.find((item) => item.account === account)

    return {
      account,
      percentage: split ? split.percentage : getDefaultFinancePercentage(account),
    }
  })
}

async function upsertAppointmentFinance(
  appointmentId: string,
  price: number,
  percentages: Array<{ account: WorkerAccount; percentage: number }>
) {
  const existingSplits = await prisma.financialSplit.findMany({
    where: { appointmentId },
  })
  const workerAccounts = percentages
    .filter((item) => item.account !== WorkerAccount.FAMADETAIL && item.percentage > 0)
    .map((item) => item.account)

  await prisma.$transaction([
    prisma.appointmentWorker.deleteMany({ where: { appointmentId } }),
    ...workerAccounts.map((worker) =>
      prisma.appointmentWorker.create({
        data: {
          appointmentId,
          worker,
        },
      })
    ),
    ...percentages.map(({ account, percentage }) => {
      const existing = existingSplits.find((split) => split.account === account)
      const amount = roundMoney((price * percentage) / 100)
      const paidAmount = existing ? getSplitPaidAmount(existing) : 0

      return prisma.financialSplit.upsert({
        where: {
          appointmentId_account: {
            appointmentId,
            account,
          },
        },
        update: {
          amount,
          percentage,
          paidAmount,
          isPaid: isMoneyPaid(paidAmount, amount),
          paidAt: isMoneyPaid(paidAmount, amount) && amount > 0 ? new Date() : null,
        },
        create: {
          appointmentId,
          account,
          amount,
          percentage,
        },
      })
    }),
  ])
}

async function normalizeAppointmentGroup(groupId: string) {
  const appointments = await prisma.appointment.findMany({
    where: { groupId },
    orderBy: { date: "asc" },
  })

  if (appointments.length === 0) return null

  const groupOrderNumber =
    appointments.find((appointment) => appointment.orderNumber)?.orderNumber ||
    (await nextServiceOrderNumber(prisma, appointments[0].date))

  if (appointments.length === 1) {
    await prisma.appointment.update({
      where: { id: appointments[0].id },
      data: {
        groupId: null,
        orderNumber: groupOrderNumber,
        serviceIndex: null,
        serviceTotal: null,
      },
    })

    return appointments[0].id
  }

  await prisma.$transaction(
    appointments.map((appointment, index) =>
      prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          orderNumber: groupOrderNumber,
          serviceIndex: index + 1,
          serviceTotal: appointments.length,
        },
      })
    )
  )

  return appointments[0].id
}

function getSplitPercentage({
  account,
  splits,
  total,
}: {
  account: WorkerAccount
  splits: Array<{ account: WorkerAccount; amount: number; percentage: number }>
  total: number
}) {
  const split = splits.find((item) => item.account === account)
  if (!split) {
    return getDefaultFinancePercentage(account)
  }

  if (split.percentage > 0) return split.percentage
  if (total <= 0) return 0

  return (split.amount / total) * 100
}

export default async function AppointmentDetailPage({ params }: Props) {
  const { id } = await params

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      customer: true,
      vehicle: true,
      serviceTemplate: true,
      workers: true,
      financialSplits: true,
      photos: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!appointment) notFound()

  const appointmentGroupId = appointment.groupId
  const groupedAppointments = appointment.groupId
    ? await prisma.appointment.findMany({
        where: { groupId: appointment.groupId },
        include: {
          serviceTemplate: true,
          workers: true,
          financialSplits: true,
        },
        orderBy: { date: "asc" },
      })
    : [appointment]

  async function updateStatus(formData: FormData) {
    "use server"

    await requireAdmin()

    const status = String(formData.get("status") || "") as AppointmentStatus
    if (!Object.values(AppointmentStatus).includes(status)) return

    await updateAppointmentStatusWithStock(id, status)

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
    revalidatePath("/marcar")
    revalidatePath("/stock")
    revalidatePath("/analytics")
  }

  async function updatePayment(formData: FormData) {
    "use server"

    await requireAdmin()

    const isPaid = String(formData.get("isPaid") || "") === "on"
    const paymentMethodValue = String(formData.get("paymentMethod") || "")
    const paymentMethod =
      isPaid && Object.values(PaymentMethod).includes(paymentMethodValue as PaymentMethod)
        ? (paymentMethodValue as PaymentMethod)
        : null

    await prisma.appointment.update({
      where: { id },
      data: {
        isPaid,
        paymentMethod,
      },
    })

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
  }

  async function updateWorkersAndFinance(formData: FormData) {
    "use server"

    await requireAdmin()

    const percentages = Object.values(WorkerAccount).map((account) => {
      const value = String(formData.get(`percentage_${account}`) || "0").replace(",", ".")
      const percentage = Number(value)

      return {
        account,
        percentage: Number.isFinite(percentage) ? Math.max(0, percentage) : 0,
      }
    })

    const totalPercentage = percentages.reduce(
      (sum, item) => sum + item.percentage,
      0
    )

    if (Math.abs(totalPercentage - 100) > 0.01) return

    const workerAccounts = percentages
      .filter(
        (item) =>
          item.account !== WorkerAccount.FAMADETAIL &&
          item.percentage > 0
      )
      .map((item) => item.account)

    const targetAppointments = await prisma.appointment.findMany({
      where: appointmentGroupId ? { groupId: appointmentGroupId } : { id },
      include: {
        serviceTemplate: true,
        financialSplits: true,
      },
    })

    await prisma.$transaction(
      targetAppointments.flatMap((item) => {
        const price = item.serviceTemplate?.price || 0

        return [
          prisma.appointmentWorker.deleteMany({
            where: { appointmentId: item.id },
          }),
          ...workerAccounts.map((worker) =>
            prisma.appointmentWorker.upsert({
              where: {
                appointmentId_worker: {
                  appointmentId: item.id,
                  worker,
                },
              },
              update: {},
              create: {
                appointmentId: item.id,
                worker,
              },
            })
          ),
          ...percentages.map(({ account, percentage }) => {
            const existing = item.financialSplits.find(
              (split) => split.account === account
            )
            const amount = roundMoney((price * percentage) / 100)
            const paidAmount = existing ? getSplitPaidAmount(existing) : 0

            return prisma.financialSplit.upsert({
              where: {
                appointmentId_account: {
                  appointmentId: item.id,
                  account,
                },
              },
              update: {
                amount,
                percentage,
                paidAmount,
                isPaid: isMoneyPaid(paidAmount, amount),
                paidAt: isMoneyPaid(paidAmount, amount) && amount > 0 ? new Date() : null,
              },
              create: {
                appointmentId: item.id,
                account,
                amount,
                percentage,
              },
            })
          }),
        ]
      })
    )

    await Promise.all(
      Object.values(WorkerAccount).map((account) =>
        redistributeAccountCredit(account)
      )
    )

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
    revalidatePath("/financeiro")
  }

  async function sendReadyNotification() {
    "use server"

    await requireAdmin()

    const item = await prisma.appointment.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicle: true,
        serviceTemplate: true,
      },
    })

    if (!item?.customer.email) return

    await quietly(sendVehicleReadyEmail(item))

    revalidatePath(`/agenda/${id}`)
  }

  async function updateAppointmentService(formData: FormData) {
    "use server"

    await requireAdmin()

    const appointmentId = String(formData.get("appointmentId") || "")
    const serviceTemplateId = String(formData.get("serviceTemplateId") || "")

    if (!appointmentId || !serviceTemplateId) return

    const [targetAppointment, serviceTemplate] = await Promise.all([
      prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { financialSplits: true },
      }),
      prisma.serviceTemplate.findUnique({ where: { id: serviceTemplateId } }),
    ])

    if (!targetAppointment || !serviceTemplate) return

    const endDate = new Date(
      targetAppointment.date.getTime() + serviceTemplate.durationMinutes * 60000
    )
    const percentages = getFinancePercentagesFromSplits(targetAppointment.financialSplits)

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        title: serviceTemplate.name,
        serviceTemplateId: serviceTemplate.id,
        endDate,
      },
    })

    await upsertAppointmentFinance(
      appointmentId,
      serviceTemplate.price,
      percentages
    )
    await Promise.all(
      Object.values(WorkerAccount).map((account) =>
        redistributeAccountCredit(account)
      )
    )

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
    revalidatePath("/financeiro")
    revalidatePath("/analytics")
  }

  async function addAppointmentService(formData: FormData) {
    "use server"

    await requireAdmin()

    const serviceTemplateId = String(formData.get("serviceTemplateId") || "")
    if (!serviceTemplateId) return

    const [baseAppointment, serviceTemplate] = await Promise.all([
      prisma.appointment.findUnique({
        where: { id },
        include: { financialSplits: true },
      }),
      prisma.serviceTemplate.findUnique({ where: { id: serviceTemplateId } }),
    ])

    if (!baseAppointment || !serviceTemplate) return

    let targetGroupId = baseAppointment.groupId
    let appointmentOrderNumber = baseAppointment.orderNumber

    if (!targetGroupId) {
      targetGroupId = randomUUID()
      appointmentOrderNumber =
        appointmentOrderNumber || (await nextServiceOrderNumber(prisma, baseAppointment.date))
      await prisma.appointment.update({
        where: { id: baseAppointment.id },
        data: {
          groupId: targetGroupId,
          orderNumber: appointmentOrderNumber,
        },
      })
    }

    const groupedItems = await prisma.appointment.findMany({
      where: { groupId: targetGroupId },
      include: { financialSplits: true },
      orderBy: { date: "asc" },
    })
    appointmentOrderNumber =
      appointmentOrderNumber ||
      groupedItems.find((item) => item.orderNumber)?.orderNumber ||
      (await nextServiceOrderNumber(prisma, baseAppointment.date))
    const lastItem = groupedItems[groupedItems.length - 1] || baseAppointment
    const startDate = lastItem.endDate || lastItem.date
    const endDate = new Date(startDate.getTime() + serviceTemplate.durationMinutes * 60000)
    const percentages = getFinancePercentagesFromSplits(
      groupedItems.flatMap((item) => item.financialSplits)
    )

    const created = await prisma.appointment.create({
      data: {
        orderNumber: appointmentOrderNumber,
        title: serviceTemplate.name,
        notes: baseAppointment.notes,
        date: startDate,
        endDate,
        status: baseAppointment.status,
        customerId: baseAppointment.customerId,
        vehicleId: baseAppointment.vehicleId,
        serviceTemplateId: serviceTemplate.id,
        isPaid: baseAppointment.isPaid,
        paymentMethod: baseAppointment.paymentMethod,
        groupId: targetGroupId,
      },
    })

    await normalizeAppointmentGroup(targetGroupId)
    await upsertAppointmentFinance(created.id, serviceTemplate.price, percentages)
    await Promise.all(
      Object.values(WorkerAccount).map((account) =>
        redistributeAccountCredit(account)
      )
    )

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
    revalidatePath("/financeiro")
    revalidatePath("/analytics")
  }

  async function deleteAppointmentService(formData: FormData) {
    "use server"

    await requireAdmin()

    const appointmentId = String(formData.get("appointmentId") || "")
    if (!appointmentId) return

    const targetAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, groupId: true },
    })

    if (!targetAppointment) return

    await prisma.$transaction([
      prisma.stockMovement.deleteMany({ where: { appointmentId } }),
      prisma.vehiclePhoto.updateMany({
        where: { appointmentId },
        data: { appointmentId: null },
      }),
      prisma.appointment.delete({ where: { id: appointmentId } }),
    ])

    const nextAppointmentId = targetAppointment.groupId
      ? await normalizeAppointmentGroup(targetAppointment.groupId)
      : null

    await Promise.all(
      Object.values(WorkerAccount).map((account) =>
        redistributeAccountCredit(account)
      )
    )

    revalidatePath("/agenda")
    revalidatePath(`/agenda/${id}`)
    revalidatePath("/dashboard")
    revalidatePath("/financeiro")
    revalidatePath("/analytics")

    if (appointmentId === id) {
      redirect(nextAppointmentId ? `/agenda/${nextAppointmentId}` : "/agenda")
    }
  }

  const allServices = await prisma.serviceTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })
  const beforePhotos = appointment.photos.filter((photo) => photo.type === "BEFORE")
  const afterPhotos = appointment.photos.filter((photo) => photo.type === "AFTER")
  const totalPrice = groupedAppointments.reduce(
    (sum, item) => roundMoney(sum + (item.serviceTemplate?.price || 0)),
    0
  )
  const financeSplits = groupedAppointments.flatMap((item) =>
    item.financialSplits.map((split) => ({
      ...split,
      appointmentTitle: item.title,
    }))
  )
  const financeByAccount = Object.values(WorkerAccount).map((account) => {
    const percentage = getSplitPercentage({
      account,
      splits: financeSplits,
      total: totalPrice,
    })
    const existingAmount = financeSplits
      .filter((split) => split.account === account)
      .reduce((sum, split) => roundMoney(sum + split.amount), 0)
    const paid = financeSplits
      .filter((split) => split.account === account)
      .reduce((sum, split) => roundMoney(sum + getSplitPaidAmount(split)), 0)

    return {
      account,
      percentage,
      amount:
        existingAmount > 0
          ? existingAmount
          : roundMoney((totalPrice * percentage) / 100),
      paid,
    }
  })
  const totalFinancePercentage = financeByAccount.reduce(
    (sum, split) => sum + split.percentage,
    0
  )

  return (
    <section className="px-3 py-4 sm:px-4 lg:p-8">
      <Link
        href="/agenda"
        className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar a agenda
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">
            Marcação
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            {appointment.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {appointment.orderNumber || "Sem OS"} · Ficha operacional com inicio, conclusao, fotos e pagamento.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
            {statusLabel(appointment.status)}
          </span>
          <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">
            {appointment.isPaid ? `Pago · ${methodLabel(appointment.paymentMethod)}` : "Por pagar"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Resumo</h2>
                <p className="text-sm text-zinc-400">Horário e valor da marcação</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Inicio</p>
                <p className="mt-2 font-semibold">{formatDate(appointment.date)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Conclusao</p>
                <p className="mt-2 font-semibold">
                  {appointment.endDate ? formatDate(appointment.endDate) : "Sem fim"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
                    <Euro className="h-4 w-4" />
                    Valor
                  </p>
                  <p className="mt-2 font-semibold">{formatMoney(totalPrice)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Serviços</p>
                  <p className="mt-2 font-semibold">{groupedAppointments.length}</p>
                </div>
              </div>
            </div>
          </div>

          <form
            action={updateStatus}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <h2 className="mb-4 text-lg font-semibold">Estado do serviço</h2>
            <div className="space-y-2">
              {Object.values(AppointmentStatus).map((status) => (
                <button
                  key={status}
                  name="status"
                  value={status}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    appointment.status === status
                      ? "border-zinc-100 bg-zinc-100 text-black"
                      : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                  }`}
                >
                  {statusLabel(status)}
                  {appointment.status === status && <CheckCircle className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </form>

          <form
            action={updatePayment}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Pagamento</h2>
                <p className="text-sm text-zinc-400">Marca se ja foi pago</p>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
              <input
                name="isPaid"
                type="checkbox"
                defaultChecked={appointment.isPaid}
                className="h-4 w-4 accent-red-300"
              />
              Pago
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="CASH"
                  defaultChecked={appointment.paymentMethod === "CASH"}
                  className="h-4 w-4 accent-red-300"
                />
                Numerário
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="MBWAY"
                  defaultChecked={appointment.paymentMethod === "MBWAY"}
                  className="h-4 w-4 accent-red-300"
                />
                MB Way
              </label>
            </div>

            <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              <Save className="h-4 w-4" />
              Guardar pagamento
            </button>
          </form>

          <form
            action={updateWorkersAndFinance}
            className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Trabalhadores</h2>
                <p className="text-sm text-zinc-400">Define a percentagem financeira</p>
              </div>
            </div>

            <div className="space-y-3">
              {financeByAccount.map((split) => (
                <label
                  key={split.account}
                  className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{workerLabel(split.account)}</span>
                    <span className="text-xs text-zinc-500">
                      {formatMoney(split.amount)} definido
                    </span>
                  </span>
                  <span className="mt-3 grid grid-cols-[1fr_auto] gap-3">
                    <input
                      name={`percentage_${split.account}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={Number(split.percentage.toFixed(2))}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-red-300/60"
                    />
                    <span className="flex min-w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-3 text-sm font-black text-zinc-300">
                      %
                    </span>
                  </span>
                  <span className="mt-2 block text-xs text-zinc-500">
                    Pago: {formatMoney(split.paid)} · Falta:{" "}
                    {formatMoney(missingMoney(split.amount, split.paid))}
                  </span>
                </label>
              ))}
            </div>

            <p
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                Math.abs(totalFinancePercentage - 100) <= 0.01
                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-400/20 bg-amber-500/10 text-amber-100"
              }`}
            >
              Total atual: {totalFinancePercentage.toFixed(2)}%. Para guardar, o total
              deve ser 100%.
            </p>

            <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-black text-black transition hover:bg-white">
              <Save className="h-4 w-4" />
              Guardar percentagens
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Cliente</h2>
                  <p className="text-sm text-zinc-400">{appointment.customer.phone || "Sem telefone"}</p>
                </div>
              </div>
              <p className="text-xl font-semibold">{appointment.customer.name}</p>
              <p className="mt-2 break-all text-sm text-zinc-400">
                {appointment.customer.email || "Sem email"}
              </p>
              <form action={sendReadyNotification}>
                <button
                  disabled={!appointment.customer.email}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-3 text-xs font-black text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mail className="h-4 w-4" />
                  Enviar aviso: carro pronto
                </button>
              </form>
              <Link
                href={`/clientes/${appointment.customerId}`}
                className="mt-4 inline-flex rounded-full border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-200"
              >
                Abrir cliente
              </Link>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
                  <Car className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Carro</h2>
                  <p className="text-sm text-zinc-400">{appointment.vehicle.plate}</p>
                </div>
              </div>
              <p className="text-xl font-semibold">
                {appointment.vehicle.brand} {appointment.vehicle.model}
              </p>
              <Link
                href={`/carros/${appointment.vehicleId}`}
                className="mt-4 inline-flex rounded-full border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-200"
              >
                Abrir histórico
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="grid gap-3 border-b border-white/10 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <h2 className="text-lg font-semibold">Serviços da marcação</h2>
                <p className="text-sm text-zinc-400">
                  Edita, acrescenta ou remove serviços individualmente.
                </p>
              </div>
              <form action={addAppointmentService} className="flex flex-col gap-2 sm:flex-row">
                <select
                  name="serviceTemplateId"
                  required
                  className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-red-300/60"
                >
                  <option value="">Adicionar serviço</option>
                  {allServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} - {formatMoney(service.price)}
                    </option>
                  ))}
                </select>
                <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-100 px-4 py-2 text-xs font-black text-black transition hover:bg-white">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              </form>
            </div>
            <div className="divide-y divide-white/10">
              {groupedAppointments.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-3 p-4 xl:grid-cols-[1fr_100px_100px_110px_260px]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-500/10 text-sm font-black text-red-200">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs font-semibold text-red-200">
                        {item.orderNumber || "Sem OS"}
                      </p>
                      <p className="text-sm text-zinc-400">
                        {item.serviceTemplate?.durationMinutes || 0}min
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Inicio</p>
                    <p className="mt-1 font-semibold">{formatTime(item.date)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Conclusao</p>
                    <p className="mt-1 font-semibold">
                      {item.endDate ? formatTime(item.endDate) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Estado</p>
                    <p className="mt-1 font-semibold">{statusLabel(item.status)}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
                    <form action={updateAppointmentService} className="flex flex-1 gap-2">
                      <input type="hidden" name="appointmentId" value={item.id} />
                      <select
                        name="serviceTemplateId"
                        defaultValue={item.serviceTemplateId || ""}
                        required
                        className="min-h-10 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-red-300/60"
                      >
                        {allServices.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </select>
                      <button className="rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/10">
                        Guardar
                      </button>
                    </form>
                    <form action={deleteAppointmentService}>
                      <input type="hidden" name="appointmentId" value={item.id} />
                      <ConfirmSubmitButton
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-3 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 sm:w-auto"
                        message="Tens a certeza que queres remover este serviço da marcação?"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {appointment.notes && (
            <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Notas</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                {appointment.notes}
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0C]">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <h2 className="text-lg font-semibold">Fotos antes/depois</h2>
              <p className="text-sm text-zinc-400">Registo fotográfico desta marcação</p>
            </div>
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Antes</h3>
                    <p className="text-sm text-zinc-400">{beforePhotos.length} foto(s)</p>
                  </div>
                  <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-black text-red-200">
                    BEFORE
                  </span>
                </div>
                <div className="mb-4">
                  <VehiclePhotoUpload
                    vehicleId={appointment.vehicleId}
                    appointmentId={appointment.id}
                    type="BEFORE"
                  />
                </div>
                <PhotoGallery photos={beforePhotos} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Depois</h3>
                    <p className="text-sm text-zinc-400">{afterPhotos.length} foto(s)</p>
                  </div>
                  <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-black text-red-200">
                    AFTER
                  </span>
                </div>
                <div className="mb-4">
                  <VehiclePhotoUpload
                    vehicleId={appointment.vehicleId}
                    appointmentId={appointment.id}
                    type="AFTER"
                  />
                </div>
                <PhotoGallery photos={afterPhotos} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
