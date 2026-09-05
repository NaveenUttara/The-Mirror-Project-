import { MedusaService } from "@medusajs/framework/utils"
import {
  MirrorAuditLog,
  MirrorOtpRequest,
  MirrorPothole,
  MirrorReport,
  MirrorReportPhoto,
  MirrorSession,
  MirrorStatusHistory,
  MirrorUser,
} from "./models/mirror"

export class MirrorModuleService extends MedusaService({
  MirrorUser,
  MirrorOtpRequest,
  MirrorSession,
  MirrorPothole,
  MirrorReport,
  MirrorReportPhoto,
  MirrorStatusHistory,
  MirrorAuditLog,
}) {}

export default MirrorModuleService
