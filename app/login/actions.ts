"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") || "")
  const redirectTo = String(formData.get("redirect") || "/")

  if (!process.env.ADMIN_ACCESS_TOKEN) {
    redirect("/login?error=config")
  }

  if (password !== process.env.ADMIN_ACCESS_TOKEN) {
    redirect("/login?error=invalid")
  }

  const cookieStore = await cookies()

  cookieStore.set("famadetail_admin", password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  redirect(redirectTo)
}

export async function logoutAction() {
  const cookieStore = await cookies()

  cookieStore.delete("famadetail_admin")

  redirect("/login")
}