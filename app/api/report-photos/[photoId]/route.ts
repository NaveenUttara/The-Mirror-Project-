import { NextResponse } from "next/server";
import oracledb from "oracledb";
import { authenticateRequest } from "@/lib/auth";
import { getConnection } from "@/lib/db";
import {
  isMissingR2Object,
  loadLegacyLocalReportPhoto,
  loadReportPhoto,
} from "@/lib/report-storage";
import { forwardedResponse, getMedusaBackendUrl } from "@/lib/medusa-proxy";

export const runtime = "nodejs";

type PhotoRow = {
  objectKey: string;
  mimeType: string;
};

export async function GET(
  request: Request,
  context: RouteContext<"/api/report-photos/[photoId]">,
) {
  try {
    const { photoId } = await context.params;

    const medusaUrl = getMedusaBackendUrl();
    if (medusaUrl) {
      const response = await fetch(`${medusaUrl}/mirror/report-photos/${encodeURIComponent(photoId)}`, {
        headers: { Authorization: request.headers.get("authorization") || "" },
        cache: "no-store",
      });
      return forwardedResponse(response);
    }

    const user = authenticateRequest(request);

    if (!/^\d+$/.test(photoId)) {
      return NextResponse.json({ error: "Invalid photograph identifier" }, { status: 400 });
    }

    const connection = await getConnection();

    try {
      const result = await connection.execute<PhotoRow>(
        `SELECT rp.object_key AS "objectKey", rp.mime_type AS "mimeType"
           FROM MIRROR_REPORT_PHOTOS rp
           JOIN MIRROR_REPORTS r ON r.id = rp.report_id
          WHERE rp.id = :photoId
            AND r.citizen_id = :userId`,
        { photoId: Number(photoId), userId: user.userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const photo = result.rows?.[0];

      if (!photo) {
        return NextResponse.json({ error: "Photograph not found" }, { status: 404 });
      }

      const photoBytes = await loadReportPhoto(photo.objectKey).catch(async (error: unknown) => {
        if (isMissingR2Object(error)) {
          return loadLegacyLocalReportPhoto(photo.objectKey);
        }
        throw error;
      });

      return new Response(new Uint8Array(photoBytes), {
        headers: {
          "Content-Type": photo.mimeType,
          "Content-Length": String(photoBytes.byteLength),
          "Cache-Control": "private, no-store",
          "Content-Disposition": `inline; filename="report-${photoId}"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } finally {
      await connection.close();
    }
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Please sign in to view this photograph" }, { status: 401 });
    }

    if (
      error instanceof Error
      && (("code" in error && error.code === "ENOENT") || isMissingR2Object(error))
    ) {
      return NextResponse.json({ error: "Photograph file not found" }, { status: 404 });
    }

    if (error instanceof Error && error.message === "INVALID_PHOTO_PATH") {
      return NextResponse.json({ error: "Invalid photograph path" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
