import { createUploadthing, type FileRouter } from "uploadthing/next"

const f = createUploadthing()

export const ourFileRouter = {
  vehiclePhotos: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 10,
    },
  }).onUploadComplete(async ({ file }) => {
    return {
      url: file.url,
      name: file.name,
    }
  }),
} satisfies FileRouter

export type OurFileRouter = typeof ourFileRouter