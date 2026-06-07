"use client"

import Image from "next/image"
import Link from "next/link"
import { ReactNode } from "react"
import { usePathname } from "next/navigation"

import { Sidebar } from "./sidebar"
import { MobileNav } from "./mobile-nav"
import { PublicBookingNotifier } from "@/components/public-booking-notifier"

type Props = {
  children: ReactNode
}

export function DashboardLayout({
  children,
}: Props) {
  const pathname = usePathname()
  const publicRoute = pathname?.startsWith("/marcar")

  if (publicRoute) {
    return (
      <div className="min-h-screen bg-[#030712] text-white">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/92 px-3 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="relative h-16 w-52 overflow-hidden rounded-xl bg-[#211d1d]"
          >
            <Image
              src="/brand/famadetail-logo-cropped.png"
              alt="FamaDetail"
              fill
              priority
              sizes="208px"
              className="object-contain p-2"
            />
          </Link>

          <div className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-200">
            ERP
          </div>
        </div>
      </header>

      <div className="flex">
        <Sidebar />

        <main className="min-h-screen flex-1 pb-32 lg:pb-0">
          {children}
        </main>
      </div>

      <MobileNav />
      <PublicBookingNotifier />
    </div>
  )
}
