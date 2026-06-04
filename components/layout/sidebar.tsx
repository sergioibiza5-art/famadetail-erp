"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Car,
  CalendarDays,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Wrench,
  BarChart3,
} from "lucide-react"

const links = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/clientes",
    label: "Clientes",
    icon: Users,
  },
  {
    href: "/carros",
    label: "Carros",
    icon: Car,
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: CalendarDays,
  },
  {
    href: "/servicos",
    label: "Serviços",
    icon: Wrench,
  },
  {
    href: "/stock",
    label: "Stock",
    icon: Package,
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-65 border-r border-white/10 bg-[#070707] lg:flex lg:flex-col">
      <div className="border-b border-white/10 px-5 py-6">
        <Link href="/" className="block">
          <div className="relative h-32 overflow-hidden rounded-2xl border border-white/10 bg-[#211d1d]">
            <Image
              src="/brand/famadetail-logo-cropped.png"
              alt="FamaDetail"
              fill
              priority
              sizes="260px"
              className="object-contain p-3"
            />
          </div>
        </Link>

        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Premium ERP
        </p>
      </div>

      <nav className="flex-1 space-y-2 p-4">
        {links.map((link) => {
          const Icon = link.icon

          const active = pathname === link.href

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-red-500/12 text-red-300 ring-1 ring-red-400/25"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-red-300" : ""}`} />

              {link.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <Link
          href="/settings"
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-5 w-5" />

          Definições
        </Link>
      </div>
    </aside>
  )
}
