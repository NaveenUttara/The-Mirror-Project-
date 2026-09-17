import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../modules/mirror"
import type { MirrorModuleService } from "../../../modules/mirror/service"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const service = _req.scope.resolve(MIRROR_MODULE) as MirrorModuleService

  try {
    const [allReports, submitted, underVerification, inProgress, repaired, potholes] = await Promise.all([
      service.listAndCountMirrorReports({}, {}),
      service.listAndCountMirrorReports({ status: "submitted" }, {}),
      service.listAndCountMirrorReports({ status: "under_verification" }, {}),
      service.listAndCountMirrorReports({ status: "in_progress" }, {}),
      service.listAndCountMirrorReports({ status: "repaired" }, {}),
      service.listMirrorPotholes({}, { take: 100, order: { created_at: "DESC" } }),
    ])

    const issues = potholes
      .filter((pothole) => pothole.status !== "rejected")
      .map((pothole) => ({
        id: pothole.id,
        latitude: pothole.latitude,
        longitude: pothole.longitude,
        severity: pothole.severity,
        status: pothole.status,
      }))

    return res.json({
      totalReports: allReports[1],
      underReview: submitted[1] + underVerification[1],
      inProgress: inProgress[1],
      repaired: repaired[1],
      issues,
    })
  } catch {
    return res.status(500).json({ error: "Public impact statistics are temporarily unavailable" })
  }
}
