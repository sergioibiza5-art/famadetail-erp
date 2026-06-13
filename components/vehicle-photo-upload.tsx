"use client"

import { ImagePlus } from "lucide-react"
import { UploadDropzone } from "@/lib/uploadthing"

type Props = {
  vehicleId: string
  appointmentId?: string
  type: "BEFORE" | "AFTER"
}

export function VehiclePhotoUpload({
  vehicleId,
  appointmentId,
  type,
}: Props) {
  const label = type === "BEFORE" ? "Adicionar fotos antes" : "Adicionar fotos depois"

  return (
    <UploadDropzone
      endpoint="vehiclePhotos"
      onClientUploadComplete={async (files) => {
        if (!files?.length) return

        for (const file of files) {
          await fetch("/api/vehicle-photos", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              vehicleId,
              appointmentId,
              type,
              imageUrl: file.url,
            }),
          })
        }

        window.location.reload()
      }}
      onUploadError={(error: Error) => {
        alert(`Erro: ${error.message}`)
      }}
      appearance={{
        container:
          "w-full min-h-36 border border-dashed border-white/10 rounded-2xl bg-black/20 p-4 transition hover:border-red-400/40 ut-ready:bg-black/20 ut-uploading:bg-red-500/10",
        uploadIcon: "hidden",
        label: "text-sm text-white",
        allowedContent: "mt-1 text-[11px] text-zinc-500",
        button:
          "mt-3 rounded-xl bg-red-500 px-4 py-2 text-xs font-black text-white hover:bg-red-400 ut-readying:bg-red-500 ut-uploading:bg-red-500",
      }}
      content={{
        label: (
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl bg-red-400/10 p-3 text-red-300">
              <ImagePlus className="h-5 w-5" />
            </div>

            <div className="text-center">
              <p className="text-sm font-semibold">
                {label}
              </p>

              <p className="mt-1 text-xs text-zinc-400">
                Arrasta imagens ou clica aqui
              </p>
            </div>
          </div>
        ),
      }}
    />
  )
}
