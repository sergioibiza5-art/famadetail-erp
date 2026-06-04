import Image from "next/image"
import { PublicBookingForm } from "@/components/public-booking-form"
import { prisma } from "@/lib/prisma"
import { getAppSettings } from "@/lib/settings"

export const dynamic = "force-dynamic"

export default async function PublicBookingPage() {
  const settings = await getAppSettings()

  const services = await prisma.serviceTemplate.findMany({
    where: {
      isActive: true,
      publicBookingEnabled: true,
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <main className="min-h-screen bg-[#050505] px-3 py-4 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <section className="lg:sticky lg:top-8">
          <div className="relative mb-5 h-16 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#211d1d] lg:h-28 lg:w-full">
            <Image
              src="/brand/famadetail-logo-cropped.png"
              alt="FamaDetail"
              fill
              priority
              sizes="(max-width: 1024px) 208px, 440px"
              className="object-contain p-3"
            />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-300">
            {settings.businessName}
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            Marque o seu detalhe automovel
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7">
            Escolha o servico, selecione um horario livre e envie o pedido. A
            equipa confirma antes da marcacao ficar definitiva.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ["Horarios reais", "So aparecem horarios disponiveis."],
              ["Pedido pendente", "Recebe confirmacao depois de ser revisto."],
              ["Sem precos visiveis", "O pedido mostra apenas servico e horario."],
            ].map(([title, text]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm text-zinc-400">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {!settings.bookingEnabled ? (
          <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-8 text-center text-sm text-zinc-400">
            As marcacoes online estao temporariamente indisponiveis.
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#0B0B0C] p-8 text-center text-sm text-zinc-400">
            Ainda nao existem servicos disponiveis para marcacao.
          </div>
        ) : (
          <PublicBookingForm
            services={services}
            pickupEnabled={settings.pickupEnabled}
          />
        )}
      </div>
    </main>
  )
}
