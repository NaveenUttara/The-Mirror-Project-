import { model } from "@medusajs/framework/utils"

export const MirrorUser = model
  .define("mirror_user", {
    id: model.id({ prefix: "musr" }).primaryKey(),
    name: model.text().searchable(),
    phone: model.text().searchable(),
    email: model.text().searchable().nullable(),
    role: model
      .enum(["citizen", "officer", "service_provider", "admin", "super_admin"])
      .default("citizen"),
    phone_verified: model.boolean().default(false),
    otp_requests: model.hasMany(() => MirrorOtpRequest, {
      mappedBy: "user",
    }),
    sessions: model.hasMany(() => MirrorSession, {
      mappedBy: "user",
    }),
    reports: model.hasMany(() => MirrorReport, {
      mappedBy: "citizen",
    }),
  })
  .indexes([
    {
      on: ["phone"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["email"],
      where: "deleted_at IS NULL AND email IS NOT NULL",
    },
  ])

export const MirrorOtpRequest = model
  .define("mirror_otp_request", {
    id: model.id({ prefix: "motp" }).primaryKey(),
    phone: model.text().index(),
    otp_hash: model.text(),
    expires_at: model.dateTime(),
    attempts: model.number().default(0),
    verified_at: model.dateTime().nullable(),
    user: model
      .belongsTo(() => MirrorUser, {
        mappedBy: "otp_requests",
      })
      .nullable(),
  })
  .indexes([
    {
      on: ["phone", "created_at"],
    },
  ])

export const MirrorSession = model
  .define("mirror_session", {
    id: model.id({ prefix: "mses" }).primaryKey(),
    token_hash: model.text(),
    expires_at: model.dateTime(),
    revoked_at: model.dateTime().nullable(),
    user: model.belongsTo(() => MirrorUser, {
      mappedBy: "sessions",
    }),
  })
  .indexes([
    {
      on: ["token_hash"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["expires_at"],
    },
  ])

export const MirrorPothole = model
  .define("mirror_pothole", {
    id: model.id({ prefix: "mpot" }).primaryKey(),
    latitude: model.float(),
    longitude: model.float(),
    address: model.text().nullable(),
    severity: model.enum(["low", "medium", "high", "critical"]),
    status: model
      .enum(["submitted", "under_verification", "in_progress", "repaired", "rejected"])
      .default("submitted"),
    reports: model.hasMany(() => MirrorReport, {
      mappedBy: "pothole",
    }),
  })
  .indexes([
    {
      on: ["latitude", "longitude"],
    },
    {
      on: ["status"],
    },
  ])

export const MirrorReport = model
  .define("mirror_report", {
    id: model.id({ prefix: "mrpt" }).primaryKey(),
    report_id: model.text().searchable(),
    description: model.text().nullable(),
    status: model
      .enum(["submitted", "under_verification", "in_progress", "repaired", "rejected"])
      .default("submitted"),
    submitted_at: model.dateTime(),
    citizen: model.belongsTo(() => MirrorUser, {
      mappedBy: "reports",
    }),
    pothole: model.belongsTo(() => MirrorPothole, {
      mappedBy: "reports",
    }),
    photos: model.hasMany(() => MirrorReportPhoto, {
      mappedBy: "report",
    }),
    status_history: model.hasMany(() => MirrorStatusHistory, {
      mappedBy: "report",
    }),
    audit_logs: model.hasMany(() => MirrorAuditLog, {
      mappedBy: "report",
    }),
  })
  .cascades({
    delete: ["photos", "status_history", "audit_logs"],
  })
  .indexes([
    {
      on: ["report_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["status", "submitted_at"],
    },
  ])

export const MirrorReportPhoto = model
  .define("mirror_report_photo", {
    id: model.id({ prefix: "mpho" }).primaryKey(),
    storage_key: model.text(),
    original_name: model.text(),
    mime_type: model.text(),
    size_bytes: model.number(),
    captured_latitude: model.float(),
    captured_longitude: model.float(),
    captured_accuracy_meters: model.float().nullable(),
    captured_at: model.dateTime(),
    confirmed_latitude: model.float(),
    confirmed_longitude: model.float(),
    confirmed_accuracy_meters: model.float().nullable(),
    distance_meters: model.float(),
    within_100_meters: model.boolean(),
    report: model.belongsTo(() => MirrorReport, {
      mappedBy: "photos",
    }),
  })
  .indexes([
    {
      on: ["storage_key"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export const MirrorStatusHistory = model
  .define("mirror_status_history", {
    id: model.id({ prefix: "msts" }).primaryKey(),
    from_status: model
      .enum(["submitted", "under_verification", "in_progress", "repaired", "rejected"])
      .nullable(),
    to_status: model.enum([
      "submitted",
      "under_verification",
      "in_progress",
      "repaired",
      "rejected",
    ]),
    note: model.text().nullable(),
    changed_by_user_id: model.text().nullable(),
    changed_at: model.dateTime(),
    report: model.belongsTo(() => MirrorReport, {
      mappedBy: "status_history",
    }),
  })
  .indexes([
    {
      on: ["changed_at"],
    },
  ])

export const MirrorAuditLog = model
  .define("mirror_audit_log", {
    id: model.id({ prefix: "maud" }).primaryKey(),
    actor_user_id: model.text().nullable(),
    action: model.text().index(),
    entity_type: model.text(),
    entity_id: model.text(),
    details: model.json().nullable(),
    ip_address: model.text().nullable(),
    occurred_at: model.dateTime(),
    report: model
      .belongsTo(() => MirrorReport, {
        mappedBy: "audit_logs",
      })
      .nullable(),
  })
  .indexes([
    {
      on: ["entity_type", "entity_id", "occurred_at"],
    },
  ])
