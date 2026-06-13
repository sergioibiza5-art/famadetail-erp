"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Car,
  CalendarDays,
  LayoutDashboard,
  Package,
  WalletCards,
  Settings,
  Users,
  Wrench,
  BarChart3,
  Receipt,
} from "lucide-react"

const links = [
  {
    href: "/",
    icon: LayoutDashboard,
    label: "Home",
  },
  {
    href: "/clientes",
    icon: Users,
    label: "Clientes",
  },
  {
    href: "/carros",
    icon: Car,
    label: "Carros",
  },
  {
    href: "/agenda",
    icon: CalendarDays,
    label: "Agenda",
  },
  {
    href: "/servicos",
    icon: Wrench,
    label: "Serviços",
  },
  {
    href: "/stock",
    icon: Package,
    label: "Stock",
  },
  {
    href: "/analytics",
    icon: BarChart3,
    label: "Stats",
  },
  {
    href: "/financeiro",
    icon: WalletCards,
    label: "Financas",
  },
  {
    href: "/despesas",
    icon: Receipt,
    label: "Despesas",
  },
  {
    href: "/settings",
    icon: Settings,
    label: "Config",
  },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#080808]/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
      <nav className="flex gap-2 overflow-x-auto">
        {links.map((link) => {
          const Icon = link.icon

          const active = pathname === link.href

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-w-20 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium transition ${
                active
                  ? "bg-red-500/12 text-red-300 ring-1 ring-red-400/25"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-5 w-5" />

              {link.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
