import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../../modules/mirror"
import type { MirrorModuleService } from "../../../../modules/mirror/service"
import { authenticateMirrorRequest } from "../../../../lib/mirror-security"
import { getPhoto } from "../../../../lib/r2-storage"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
  try {
    const user = await authenticateMirrorRequest(req, service)
    const photo = await service.retrieveMirrorReportPhoto(req.params.photoId)
    const report = await service.retrieveMirrorReport(photo.report_id)

    if (report.citizen_id !== user.id) {
      return res.status(404).json({ error: "Photograph not found" })
    }

    const bytes = await getPhoto(photo.storage_key)
    res.setHeader("Content-Type", photo.mime_type)
    res.setHeader("Content-Disposition", "inline")
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    return res.send(Buffer.from(bytes))
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return res.status(401).json({ error: "Please sign in to view this photograph" })
    }
    return res.status(404).json({ error: "Photograph not found" })
  }
}
