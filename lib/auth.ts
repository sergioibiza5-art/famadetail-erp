import "server-only"

import { cookies } from "next/headers"

export function isSafeInternalRedirect(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return false
  return !value.toLowerCase().startsWith("/\\")
}

export function safeInternalRedirect(value: string, fallback = "/") {
  if (!isSafeInternalRedirect(value)) return fallback

  try {
    const url = new URL(value, "https://famadetail.local")
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export async function requireAdmin() {
  const accessToken = process.env.ADMIN_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("Admin access token is not configured.")
  }

  const cookieStore = await cookies()
  const adminCookie = cookieStore.get("famadetail_admin")?.value

  if (adminCookie !== accessToken) {
    throw new Error("Unauthorized.")
  }
}
