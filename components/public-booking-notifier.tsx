"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, CalendarDays, X } from "lucide-react"

type LatestRequest = {
  id: string
  title: string
  date: string
  createdAt: string
  customer: {
    name: string
  }
  vehicle: {
    brand: string
    model: string
  }
}

type NotificationPayload = {
  pendingCount: number
  latestRequest: LatestRequest | null
}

const LAST_SEEN_KEY = "famadetail:last-public-booking-request"
const DISMISSED_KEY = "famadetail:dismissed-public-booking-request"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

export function PublicBookingNotifier() {
  const [latestRequest, setLatestRequest] = useState<LatestRequest | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [showPopup, setShowPopup] = useState(false)
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(() =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "default"
    )
  const initialized = useRef(false)
  const lastSeen = useRef<string | null>(null)

  const checkRequests = useCallback(async () => {
    try {
      const response = await fetch("/api/public-booking/notifications", {
        cache: "no-store",
      })

      if (!response.ok) return

      const data = (await response.json()) as NotificationPayload
      const nextRequest = data.latestRequest
      setPendingCount(data.pendingCount)

      if (!nextRequest) {
        setLatestRequest(null)
        return
      }

      const storedLastSeen = localStorage.getItem(LAST_SEEN_KEY)
      const dismissedRequest = localStorage.getItem(DISMISSED_KEY)

      if (!initialized.current) {
        initialized.current = true
        lastSeen.current = storedLastSeen || nextRequest.id

        if (!storedLastSeen) {
          localStorage.setItem(LAST_SEEN_KEY, nextRequest.id)
        }

        setLatestRequest(nextRequest)
        setShowPopup(dismissedRequest !== nextRequest.id)
        return
      }

      if (nextRequest.id !== lastSeen.current) {
        lastSeen.current = nextRequest.id
        localStorage.setItem(LAST_SEEN_KEY, nextRequest.id)
        setLatestRequest(nextRequest)
        setShowPopup(true)

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Novo pedido de marcacao", {
            body: `${nextRequest.customer.name} - ${nextRequest.title}`,
            tag: nextRequest.id,
          })
        }
      } else {
        setLatestRequest(nextRequest)
      }
    } catch {
      // Ignore transient polling failures.
    }
  }, [])

  useEffect(() => {
    const initialCheck = window.setTimeout(checkRequests, 0)
    const interval = window.setInterval(checkRequests, 15000)

    return () => {
      window.clearTimeout(initialCheck)
      window.clearInterval(interval)
    }
  }, [checkRequests])

  async function enableNotifications() {
    if (!("Notification" in window)) return

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  function dismissPopup() {
    if (latestRequest) {
      localStorage.setItem(DISMISSED_KEY, latestRequest.id)
    }

    setShowPopup(false)
  }

  if (!showPopup || !latestRequest) {
    return null
  }

  return (
    <div className="fixed right-3 top-3 z-[70] w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl border border-red-400/25 bg-[#111010] p-4 shadow-2xl shadow-black/50 sm:right-5 sm:top-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-red-500/10 p-3 text-red-300">
          <Bell className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                Novo agendamento pela pagina publica
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {pendingCount} pedido(s) pendente(s)
              </p>
            </div>

            <button
              type="button"
              onClick={dismissPopup}
              className="rounded-full p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar notificacao"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Link href={`/agenda/${latestRequest.id}`} className="mt-3 block">
            <p className="truncate font-semibold text-white">
              {latestRequest.title}
            </p>
            <p className="mt-1 truncate text-sm text-zinc-400">
              {latestRequest.customer.name} - {latestRequest.vehicle.brand}{" "}
              {latestRequest.vehicle.model}
            </p>
            <p className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
              <CalendarDays className="h-4 w-4 text-red-300" />
              {formatDate(latestRequest.date)}
            </p>
          </Link>

          {notificationPermission === "default" && (
            <button
              type="button"
              onClick={enableNotifications}
              className="mt-3 w-full rounded-xl bg-zinc-100 px-3 py-2 text-xs font-bold text-black transition hover:bg-white"
            >
              Ativar notificacoes no telemovel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
