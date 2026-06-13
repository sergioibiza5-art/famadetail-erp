type AppointmentNotification = {
  title: string
  date: Date
  endDate?: Date | null
  customer: {
    name: string
    phone?: string | null
    email?: string | null
  }
  vehicle: {
    brand: string
    model: string
    plate: string
  }
  serviceTemplate?: {
    name: string
  } | null
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(value)
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  }).format(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

async function sendResendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html: string
  text: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const from = process.env.RESEND_FROM_EMAIL || "FamaDetail <onboarding@resend.dev>"

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend email failed with status ${response.status}`)
  }
}

export async function notifyNewPublicBookingTelegram({
  appointments,
}: {
  appointments: AppointmentNotification[]
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId || appointments.length === 0) return

  const first = appointments[0]
  const services = appointments
    .map((appointment) => appointment.serviceTemplate?.name || appointment.title)
    .join(", ")

  const lines = [
    "Novo pedido FamaDetail",
    `Cliente: ${first.customer.name}`,
    `Servico: ${services}`,
    `Dia/Hora: ${formatDate(first.date)}`,
    first.endDate ? `Previsto pronto: ${formatDate(first.endDate)}` : "",
    `Carro: ${first.vehicle.brand} ${first.vehicle.model} (${first.vehicle.plate})`,
    first.customer.phone ? `Telefone: ${first.customer.phone}` : "",
    first.customer.email ? `Email: ${first.customer.email}` : "",
  ].filter(Boolean)

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join("\n"),
    }),
  })

  if (!response.ok) {
    throw new Error(`Telegram notification failed with status ${response.status}`)
  }
}

export async function sendAppointmentConfirmationEmail(
  appointment: AppointmentNotification
) {
  if (!appointment.customer.email) return

  const service = appointment.serviceTemplate?.name || appointment.title
  const date = formatDate(appointment.date)
  const endDate = appointment.endDate ? formatDate(appointment.endDate) : null
  const vehicle = `${appointment.vehicle.brand} ${appointment.vehicle.model} (${appointment.vehicle.plate})`

  await sendResendEmail({
    to: appointment.customer.email,
    subject: "Marcacao FamaDetail confirmada",
    text: [
      `Olá ${appointment.customer.name},`,
      "",
      "A sua marcação na FamaDetail foi confirmada.",
      `Serviço: ${service}`,
      `Entrada: ${date}`,
      endDate ? `Previsão de conclusão: ${endDate}` : "",
      `Veículo: ${vehicle}`,
      "",
      "Obrigado,",
      "FamaDetail",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
        <h2>Marcação FamaDetail confirmada</h2>
        <p>Olá ${escapeHtml(appointment.customer.name)},</p>
        <p>A sua marcação foi confirmada.</p>
        <ul>
          <li><strong>Serviço:</strong> ${escapeHtml(service)}</li>
          <li><strong>Entrada:</strong> ${escapeHtml(date)}</li>
          ${endDate ? `<li><strong>Previsão de conclusão:</strong> ${escapeHtml(endDate)}</li>` : ""}
          <li><strong>Veículo:</strong> ${escapeHtml(vehicle)}</li>
        </ul>
        <p>Obrigado,<br />FamaDetail</p>
      </div>
    `,
  })
}

export async function sendVehicleReadyEmail(appointment: AppointmentNotification) {
  if (!appointment.customer.email) return

  const service = appointment.serviceTemplate?.name || appointment.title
  const vehicle = `${appointment.vehicle.brand} ${appointment.vehicle.model} (${appointment.vehicle.plate})`

  await sendResendEmail({
    to: appointment.customer.email,
    subject: "O seu veículo está pronto",
    text: [
      `Olá ${appointment.customer.name},`,
      "",
      "O seu veículo está pronto para levantamento.",
      `Serviço: ${service}`,
      `Veículo: ${vehicle}`,
      `Hora do aviso: ${formatTime(new Date())}`,
      "",
      "Obrigado,",
      "FamaDetail",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
        <h2>O seu veículo está pronto</h2>
        <p>Olá ${escapeHtml(appointment.customer.name)},</p>
        <p>O seu veículo está pronto para levantamento.</p>
        <ul>
          <li><strong>Serviço:</strong> ${escapeHtml(service)}</li>
          <li><strong>Veículo:</strong> ${escapeHtml(vehicle)}</li>
          <li><strong>Hora do aviso:</strong> ${escapeHtml(formatTime(new Date()))}</li>
        </ul>
        <p>Obrigado,<br />FamaDetail</p>
      </div>
    `,
  })
}

export async function quietly<T>(task: Promise<T>) {
  try {
    await task
  } catch (error) {
    console.error(error)
  }
}
