import { randomUUID } from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../modules/mirror"
import type { MirrorModuleService } from "../../../modules/mirror/service"
import { authenticateMirrorRequest } from "../../../lib/mirror-security"
import { putPhoto, removePhoto } from "../../../lib/r2-storage"

const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}
const SEVERITIES = new Set(["low", "medium", "high", "critical"])

function text(body: Record<string, unknown>, name: string): string {
  return typeof body[name] === "string" ? body[name].trim() : ""
}

function errorResponse(res: MedusaResponse, error: unknown) {
  if (error instanceof Error && error.message === "AUTH_REQUIRED") {
    return res.status(401).json({ error: "Please sign in before viewing or submitting reports" })
  }
  const message = error instanceof Error ? error.message : "Internal Server Error"
  return res.status(500).json({ error: message })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
  let objectKey: string | undefined
  let potholeId: string | undefined
  let reportId: string | undefined

  try {
    const user = await authenticateMirrorRequest(req, service)
    const body = req.body as Record<string, unknown>
    const latitudeText = text(body, "latitude")
    const longitudeText = text(body, "longitude")
    const latitude = Number(latitudeText)
    const longitude = Number(longitudeText)
    const severity = text(body, "severity").toLowerCase()
    const description = text(body, "description")
    const photoCapturedAt = text(body, "photoCapturedAt")
    const locationCapturedAt = text(body, "locationCapturedAt")
    const locationAccuracy = Number(text(body, "locationAccuracy"))
    const photo = req.file

    if (!latitudeText || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({ error: "Enter a valid latitude" })
    }
    if (!longitudeText || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: "Enter a valid longitude" })
    }
    if (!SEVERITIES.has(severity)) {
      return res.status(400).json({ error: "Select a valid severity" })
    }
    if (description.length > 2000) {
      return res.status(400).json({ error: "Description must be 2000 characters or fewer" })
    }
    if (!photo || !PHOTO_EXTENSIONS[photo.mimetype]) {
      return res.status(400).json({ error: "A JPEG, PNG or WebP pothole photograph is required" })
    }

    const photoTime = Date.parse(photoCapturedAt)
    const locationTime = Date.parse(locationCapturedAt)
    const now = Date.now()
    if (
      !Number.isFinite(photoTime) ||
      !Number.isFinite(locationTime) ||
      now - photoTime > 15 * 60 * 1000 ||
      now - locationTime > 15 * 60 * 1000 ||
      photoTime - now > 60 * 1000 ||
      locationTime - now > 60 * 1000 ||
      Math.abs(photoTime - locationTime) > 2 * 60 * 1000
    ) {
      return res.status(400).json({ error: "Take a fresh photo and capture its location again" })
    }
    if (!Number.isFinite(locationAccuracy) || locationAccuracy <= 0 || locationAccuracy > 100) {
      return res.status(400).json({ error: "GPS accuracy must be within 100 metres" })
    }

    objectKey = `report-photos/${randomUUID()}${PHOTO_EXTENSIONS[photo.mimetype]}`
    await putPhoto(objectKey, photo.buffer, photo.mimetype)

    const pothole = await service.createMirrorPotholes({
      latitude,
      longitude,
      address: null,
      severity: severity as "low" | "medium" | "high" | "critical",
      status: "submitted",
    })
    potholeId = pothole.id

    const publicReportId = `MIR-RPT-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`
    const report = await service.createMirrorReports({
      report_id: publicReportId,
      description: description || null,
      status: "submitted",
      submitted_at: new Date(),
      citizen_id: user.id,
      pothole_id: pothole.id,
    })
    reportId = report.id

    await service.createMirrorReportPhotoes({
      storage_key: objectKey,
      original_name: photo.originalname || "pothole-photo",
      mime_type: photo.mimetype,
      size_bytes: photo.size,
      captured_latitude: latitude,
      captured_longitude: longitude,
      captured_accuracy_meters: locationAccuracy,
      captured_at: new Date(photoTime),
      confirmed_latitude: latitude,
      confirmed_longitude: longitude,
      confirmed_accuracy_meters: locationAccuracy,
      distance_meters: 0,
      within_100_meters: true,
      report_id: report.id,
    })
    await service.createMirrorStatusHistories({
      from_status: null,
      to_status: "submitted",
      note: "Report submitted by citizen",
      changed_by_user_id: user.id,
      changed_at: new Date(),
      report_id: report.id,
    })
    await service.createMirrorAuditLogs({
      actor_user_id: user.id,
      action: "report_created",
      entity_type: "report",
      entity_id: publicReportId,
      details: { latitude, longitude, locationAccuracy, photoCapturedAt, locationCapturedAt },
      ip_address: req.ip || null,
      occurred_at: new Date(),
      report_id: report.id,
    })

    return res.status(201).json({
      success: true,
      reportId: publicReportId,
      potholeId: pothole.id,
      status: "submitted",
    })
  } catch (error) {
    if (reportId) await service.deleteMirrorReports(reportId).catch(() => undefined)
    if (potholeId) await service.deleteMirrorPotholes(potholeId).catch(() => undefined)
    if (objectKey) await removePhoto(objectKey).catch(() => undefined)
    return errorResponse(res, error)
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
  try {
    const user = await authenticateMirrorRequest(req, service)
    const reports = await service.listMirrorReports(
      { citizen_id: user.id },
      { order: { submitted_at: "DESC" } },
    )
    const result = await Promise.all(reports.map(async (report) => {
      const [pothole, photos] = await Promise.all([
        service.retrieveMirrorPothole(report.pothole_id),
        service.listMirrorReportPhotoes({ report_id: report.id }, { take: 1 }),
      ])
      return {
        reportId: report.report_id,
        potholePublicId: pothole.id,
        latitude: pothole.latitude,
        longitude: pothole.longitude,
        severity: pothole.severity,
        status: report.status,
        submittedAt: report.submitted_at,
        photoUrl: photos[0] ? `/api/report-photos/${photos[0].id}` : null,
      }
    }))

    return res.json({ user: { name: user.name }, reports: result })
  } catch (error) {
    return errorResponse(res, error)
  }
}
