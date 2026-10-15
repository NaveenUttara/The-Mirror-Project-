import { randomUUID } from "node:crypto"
import type { MirrorModuleService } from "../modules/mirror/service"
import { getPhoto } from "./r2-storage"
import type { AuthorityReportEmailPayload } from "./authority-report-email"

const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}

type RuntimePhotoService = {
  listMirrorReportPhotos(
    filters: Record<string, unknown>,
    config: { take: number },
  ): Promise<Array<{ storage_key: string; mime_type: string }>>
}

export async function loadAuthorityReportEmailPayload(
  service: MirrorModuleService,
  publicReportId: string,
): Promise<AuthorityReportEmailPayload> {
  const reports = await service.listMirrorReports(
    { report_id: publicReportId },
    { take: 1 },
  )
  const report = reports[0]
  if (!report) {
    throw new Error("REPORT_NOT_FOUND")
  }

  const [pothole, citizen, photoService] = await Promise.all([
    service.retrieveMirrorPothole(report.pothole_id),
    service.retrieveMirrorUser(report.citizen_id),
    Promise.resolve(service as unknown as RuntimePhotoService),
  ])

  const photos = await photoService.listMirrorReportPhotos({ report_id: report.id }, { take: 1 })
  const photoRow = photos[0]

  let photo: AuthorityReportEmailPayload["photo"]
  if (photoRow) {
    const bytes = await getPhoto(photoRow.storage_key)
    const extension = PHOTO_EXTENSIONS[photoRow.mime_type] || ".jpg"
    photo = {
      filename: `pothole-evidence${extension}`,
      mimeType: photoRow.mime_type,
      buffer: Buffer.from(bytes),
    }
  }

  return {
    requestId: randomUUID(),
    reportId: report.report_id,
    potholeId: pothole.id,
    latitude: pothole.latitude,
    longitude: pothole.longitude,
    severity: pothole.severity,
    description: report.description ?? null,
    citizenName: citizen.name,
    citizenPhone: citizen.phone,
    citizenEmail: citizen.email ?? null,
    photo,
  }
}
