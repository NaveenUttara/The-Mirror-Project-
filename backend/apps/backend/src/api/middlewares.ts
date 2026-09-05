import { defineMiddlewares } from "@medusajs/framework/http"
import multer from "multer"

const reportPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

export default defineMiddlewares({
  routes: [
    {
      matcher: "/mirror/reports",
      method: ["POST"],
      middlewares: [reportPhotoUpload.single("photo")],
    },
  ],
})
