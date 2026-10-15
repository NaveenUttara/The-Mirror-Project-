import type { MirrorModuleService } from "../modules/mirror/service"
import { sendAuthorityReportEmail } from "./authority-report-email"
import { loadAuthorityReportEmailPayload } from "./mirror-report-email-loader"

export type AuthorityEmailBackfillOptions = {
  dryRun?: boolean
  excludeReportIds?: string[]
  onlyReportIds?: string[]
  limit?: number
  offset?: number
  delayMs?: number
}

export type AuthorityEmailBackfillRow = {
  reportId: string
  ok: boolean
  skipped?: boolean
  error?: string
  acceptedCount?: number
}

export type AuthorityEmailBackfillResult = {
  matched: number
  processed: number
  sent: number
  failed: number
  skipped: number
  nextOffset: number
  results: AuthorityEmailBackfillRow[]
}

function normalizeReportId(reportId: string): string {
  return reportId.trim().toUpperCase()
}

function shouldBackfillReportId(reportId: string, options: AuthorityEmailBackfillOptions): boolean {
  const id = normalizeReportId(reportId)
  const exclude = new Set((options.excludeReportIds ?? []).map(normalizeReportId))
  if (exclude.has(id)) {
    return false
  }

  const only = options.onlyReportIds?.map(normalizeReportId).filter(Boolean) ?? []
  if (only.length > 0) {
    return only.includes(id)
  }

  return true
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function runMedusaAuthorityEmailBackfill(
  service: MirrorModuleService,
  options: AuthorityEmailBackfillOptions = {},
): Promise<AuthorityEmailBackfillResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const offset = Math.max(options.offset ?? 0, 0)
  const delayMs = Math.max(options.delayMs ?? 700, 0)

  const reports = await service.listMirrorReports(
    {},
    { order: { submitted_at: "ASC" }, take: 5000 },
  )

  const eligible = reports
    .map((report) => report.report_id)
    .filter((reportId) => shouldBackfillReportId(reportId, options))

  const slice = eligible.slice(offset, offset + limit)
  const results: AuthorityEmailBackfillRow[] = []
  let sent = 0
  let failed = 0
  let skipped = 0

  if (options.dryRun) {
    for (const reportId of slice) {
      results.push({ reportId, ok: true, skipped: true })
      skipped += 1
    }

    return {
      matched: eligible.length,
      processed: slice.length,
      sent: 0,
      failed: 0,
      skipped: slice.length,
      nextOffset: offset + slice.length,
      results,
    }
  }

  for (const reportId of slice) {
    try {
      const payload = await loadAuthorityReportEmailPayload(service, reportId)
      const summary = await sendAuthorityReportEmail(payload)
      if (!summary || summary.acceptedCount === 0) {
        throw new Error("email_not_configured_or_all_recipients_failed")
      }
      results.push({ reportId, ok: true, acceptedCount: summary.acceptedCount })
      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error"
      results.push({ reportId, ok: false, error: message })
      failed += 1
    }

    if (delayMs > 0) {
      await delay(delayMs)
    }
  }

  return {
    matched: eligible.length,
    processed: slice.length,
    sent,
    failed,
    skipped,
    nextOffset: offset + slice.length,
    results,
  }
}
