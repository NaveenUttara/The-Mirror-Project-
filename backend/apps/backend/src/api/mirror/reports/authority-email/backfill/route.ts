import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../../../modules/mirror"
import type { MirrorModuleService } from "../../../../../modules/mirror/service"
import { runMedusaAuthorityEmailBackfill } from "../../../../../lib/authority-email-backfill"
import { assertMirrorEmailAdmin } from "../../../../../lib/mirror-email-admin"

function parseOptions(body: Record<string, unknown>) {
  return {
    dryRun: body.dryRun === true,
    excludeReportIds: Array.isArray(body.excludeReportIds)
      ? body.excludeReportIds.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    onlyReportIds: Array.isArray(body.onlyReportIds)
      ? body.onlyReportIds.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    limit: typeof body.limit === "number" ? body.limit : undefined,
    offset: typeof body.offset === "number" ? body.offset : undefined,
    delayMs: typeof body.delayMs === "number" ? body.delayMs : undefined,
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    assertMirrorEmailAdmin(req)
    const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
    const result = await runMedusaAuthorityEmailBackfill(service, { dryRun: true, limit: 10_000 })
    return res.json({
      storage: "medusa",
      totalEligible: result.matched,
      hint: "POST with excludeReportIds for reports already emailed, then paginate with offset.",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error"
    const status = message.includes("secret") ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    assertMirrorEmailAdmin(req)
    const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
    const body = (req.body ?? {}) as Record<string, unknown>
    const result = await runMedusaAuthorityEmailBackfill(service, parseOptions(body))
    const done = result.nextOffset >= result.matched

    return res.json({
      storage: "medusa",
      ...result,
      done,
      continueWith: done ? null : { offset: result.nextOffset, limit: body.limit ?? 20 },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error"
    const status = message.includes("secret") ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
