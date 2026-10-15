import { NextResponse } from "next/server";
import {
  runAuthorityEmailBackfill,
  type AuthorityEmailBackfillOptions,
} from "@/lib/authority-email-backfill";
import { assertMirrorEmailAdminRequest } from "@/lib/mirror-email-admin";
import { getMedusaBackendUrl } from "@/lib/medusa-proxy";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseOptions(body: Record<string, unknown>): AuthorityEmailBackfillOptions {
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
  };
}

function apiError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("email admin secret")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error.message.includes("REPORT_EMAIL_RESEND_SECRET")) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error.message.includes("not configured")) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
  }

  const message = error instanceof Error ? error.message : "Internal Server Error";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Preview how many reports match (GET) or run backfill (POST). */
export async function GET(request: Request) {
  try {
    assertMirrorEmailAdminRequest(request);
    const result = await runAuthorityEmailBackfill({ dryRun: true, limit: 10_000, offset: 0 });
    return NextResponse.json({
      storage: result.storage,
      emailConfigured: result.emailConfigured,
      totalEligible: result.matched,
      hint: "POST with excludeReportIds for MIR-RPT-00000013 and MIR-RPT-00000014, then repeat with offset until nextOffset >= totalEligible.",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertMirrorEmailAdminRequest(request);

    const medusaUrl = getMedusaBackendUrl();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.useMedusa === true && medusaUrl) {
      const response = await fetch(`${medusaUrl}/mirror/reports/authority-email/backfill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mirror-Email-Secret": request.headers.get("x-mirror-email-secret") || "",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      return NextResponse.json(payload, { status: response.status });
    }

    const result = await runAuthorityEmailBackfill(parseOptions(body));
    const done = result.nextOffset >= result.matched;

    return NextResponse.json({
      ...result,
      done,
      continueWith: done
        ? null
        : { offset: result.nextOffset, limit: body.limit ?? 20 },
    });
  } catch (error) {
    return apiError(error);
  }
}
