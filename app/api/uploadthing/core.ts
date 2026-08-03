import { createUploadthing, type FileRouter } from "uploadthing/next"
import { requireAdmin } from "@/lib/auth"

const f = createUploadthing()

export const ourFileRouter = {
  vehiclePhotos: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 10,
    },
  })
    .middleware(async () => {
      await requireAdmin()
      return {}
    })
    .onUploadComplete(async ({ file }) => {
    return {
      url: file.url,
      name: file.name,
    }
  }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter
