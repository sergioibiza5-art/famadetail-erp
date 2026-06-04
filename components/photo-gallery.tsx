"use client"

import Image from "next/image"
import { useState } from "react"
import { X } from "lucide-react"

type Photo = {
  id: string
  imageUrl: string
}

type Props = {
  photos: Photo[]
}

export function PhotoGallery({ photos }: Props) {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 p-5 text-center text-sm text-zinc-500">
        Nenhuma foto.
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setSelectedPhoto(photo)}
            className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20 transition hover:border-red-400/60"
          >
            <Image
              src={photo.imageUrl}
              alt=""
              width={400}
              height={300}
              className="aspect-[4/3] h-auto w-full object-cover transition duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <button
            type="button"
            onClick={() => setSelectedPhoto(null)}
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-3 text-white"
          >
            <X className="h-5 w-5" />
          </button>

          <Image
            src={selectedPhoto.imageUrl}
            alt=""
            width={1400}
            height={1000}
            className="max-h-[90vh] w-auto max-w-full rounded-2xl object-contain"
          />
        </div>
      )}
    </>
  )
}
