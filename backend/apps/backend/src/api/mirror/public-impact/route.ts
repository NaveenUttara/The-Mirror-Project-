import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../modules/mirror"
import type { MirrorModuleService } from "../../../modules/mirror/service"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const service = _req.scope.resolve(MIRROR_MODULE) as MirrorModuleService

  try {
    const [allReports, submitted, underVerification, inProgress, repaired] = await Promise.all([
      service.listAndCountMirrorReports({}, {}),
      service.listAndCountMirrorReports({ status: "submitted" }, {}),
      service.listAndCountMirrorReports({ status: "under_verification" }, {}),
      service.listAndCountMirrorReports({ status: "in_progress" }, {}),
      service.listAndCountMirrorReports({ status: "repaired" }, {}),
    ])

    return res.json({
      totalReports: allReports[1],
      underReview: submitted[1] + underVerification[1],
      inProgress: inProgress[1],
      repaired: repaired[1],
    })
  } catch {
    return res.status(500).json({ error: "Public impact statistics are temporarily unavailable" })
  }
}
