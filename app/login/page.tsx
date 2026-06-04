import Image from "next/image"
import { Lock, ShieldCheck } from "lucide-react"
import { loginAction } from "./actions"

type Props = {
  searchParams: Promise<{
    error?: string
    redirect?: string
  }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams

  const errorMessage =
    params.error === "invalid"
      ? "Password incorreta."
      : params.error === "config"
        ? "ADMIN_ACCESS_TOKEN não está configurado."
        : null

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
          <section className="hidden lg:block">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200">
              <ShieldCheck className="h-4 w-4" />
              Acesso privado
            </div>

            <h1 className="max-w-xl text-5xl font-black tracking-tight text-white">
              ERP Premium FamaDetail
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-400">
              Área reservada para gestão de clientes, carros, agenda, serviços,
              fotos e histórico.
            </p>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-red-950/20 backdrop-blur">
            <div className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 p-5">
              <Image
                src="/brand/famadetail-logo.png"
                alt="FamaDetail"
                width={520}
                height={180}
                priority
                className="mx-auto h-auto w-full max-w-xs object-contain"
              />
            </div>

            <div className="mb-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
                <Lock className="h-5 w-5" />
              </div>

              <h2 className="text-2xl font-black tracking-tight">
                Entrar na aplicação
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                Introduz a password de administrador.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                {errorMessage}
              </div>
            )}

            <form action={loginAction} className="space-y-4">
              <input
                type="hidden"
                name="redirect"
                value={params.redirect || "/"}
              />

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Password
                </label>

                <input
                  name="password"
                  type="password"
                  required
                  autoFocus
                  placeholder="Password de acesso"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-red-400/60 focus:ring-4 focus:ring-red-500/10"
                />
              </div>

              <button
                type="submit"
                className="h-14 w-full rounded-2xl bg-red-500 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-red-400 active:scale-[0.99]"
              >
                Entrar
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-zinc-600">
              Página pública de marcações continua livre em /marcar
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}