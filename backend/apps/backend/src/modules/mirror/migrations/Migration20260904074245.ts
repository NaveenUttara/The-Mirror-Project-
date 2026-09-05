import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260904074245 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mirror_report_photo" drop constraint if exists "mirror_report_photo_storage_key_unique";`);
    this.addSql(`alter table if exists "mirror_report" drop constraint if exists "mirror_report_report_id_unique";`);
    this.addSql(`alter table if exists "mirror_session" drop constraint if exists "mirror_session_token_hash_unique";`);
    this.addSql(`alter table if exists "mirror_user" drop constraint if exists "mirror_user_phone_unique";`);
    this.addSql(`create table if not exists "mirror_pothole" ("id" text not null, "latitude" real not null, "longitude" real not null, "address" text null, "severity" text check ("severity" in ('low', 'medium', 'high', 'critical')) not null, "status" text check ("status" in ('submitted', 'under_verification', 'in_progress', 'repaired', 'rejected')) not null default 'submitted', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_pothole_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_pothole_deleted_at" ON "mirror_pothole" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_pothole_latitude_longitude" ON "mirror_pothole" ("latitude", "longitude") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_pothole_status" ON "mirror_pothole" ("status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mirror_user" ("id" text not null, "name" text not null, "phone" text not null, "email" text null, "role" text check ("role" in ('citizen', 'officer', 'service_provider', 'admin', 'super_admin')) not null default 'citizen', "phone_verified" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_user_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_user_deleted_at" ON "mirror_user" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mirror_user_phone_unique" ON "mirror_user" ("phone") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_user_email" ON "mirror_user" ("email") WHERE deleted_at IS NULL AND email IS NOT NULL;`);

    this.addSql(`create table if not exists "mirror_session" ("id" text not null, "token_hash" text not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, "user_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_session_user_id" ON "mirror_session" ("user_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_session_deleted_at" ON "mirror_session" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mirror_session_token_hash_unique" ON "mirror_session" ("token_hash") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_session_expires_at" ON "mirror_session" ("expires_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mirror_report" ("id" text not null, "report_id" text not null, "description" text null, "status" text check ("status" in ('submitted', 'under_verification', 'in_progress', 'repaired', 'rejected')) not null default 'submitted', "submitted_at" timestamptz not null, "citizen_id" text not null, "pothole_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_report_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_report_citizen_id" ON "mirror_report" ("citizen_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_report_pothole_id" ON "mirror_report" ("pothole_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_report_deleted_at" ON "mirror_report" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mirror_report_report_id_unique" ON "mirror_report" ("report_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_report_status_submitted_at" ON "mirror_report" ("status", "submitted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mirror_status_history" ("id" text not null, "from_status" text check ("from_status" in ('submitted', 'under_verification', 'in_progress', 'repaired', 'rejected')) null, "to_status" text check ("to_status" in ('submitted', 'under_verification', 'in_progress', 'repaired', 'rejected')) not null, "note" text null, "changed_by_user_id" text null, "changed_at" timestamptz not null, "report_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_status_history_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_status_history_report_id" ON "mirror_status_history" ("report_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_status_history_deleted_at" ON "mirror_status_history" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_status_history_changed_at" ON "mirror_status_history" ("changed_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mirror_report_photo" ("id" text not null, "storage_key" text not null, "original_name" text not null, "mime_type" text not null, "size_bytes" integer not null, "captured_latitude" real not null, "captured_longitude" real not null, "captured_accuracy_meters" real null, "captured_at" timestamptz not null, "confirmed_latitude" real not null, "confirmed_longitude" real not null, "confirmed_accuracy_meters" real null, "distance_meters" real not null, "within_100_meters" boolean not null, "report_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_report_photo_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_report_photo_report_id" ON "mirror_report_photo" ("report_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_report_photo_deleted_at" ON "mirror_report_photo" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mirror_report_photo_storage_key_unique" ON "mirror_report_photo" ("storage_key") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mirror_audit_log" ("id" text not null, "actor_user_id" text null, "action" text not null, "entity_type" text not null, "entity_id" text not null, "details" jsonb null, "ip_address" text null, "occurred_at" timestamptz not null, "report_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_audit_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_audit_log_action" ON "mirror_audit_log" ("action") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_audit_log_report_id" ON "mirror_audit_log" ("report_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_audit_log_deleted_at" ON "mirror_audit_log" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_audit_log_entity_type_entity_id_occurred_at" ON "mirror_audit_log" ("entity_type", "entity_id", "occurred_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mirror_otp_request" ("id" text not null, "phone" text not null, "otp_hash" text not null, "expires_at" timestamptz not null, "attempts" integer not null default 0, "verified_at" timestamptz null, "user_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mirror_otp_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_otp_request_phone" ON "mirror_otp_request" ("phone") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_otp_request_user_id" ON "mirror_otp_request" ("user_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_otp_request_deleted_at" ON "mirror_otp_request" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mirror_otp_request_phone_created_at" ON "mirror_otp_request" ("phone", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "mirror_session" add constraint "mirror_session_user_id_foreign" foreign key ("user_id") references "mirror_user" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mirror_report" add constraint "mirror_report_citizen_id_foreign" foreign key ("citizen_id") references "mirror_user" ("id") on update cascade;`);
    this.addSql(`alter table if exists "mirror_report" add constraint "mirror_report_pothole_id_foreign" foreign key ("pothole_id") references "mirror_pothole" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mirror_status_history" add constraint "mirror_status_history_report_id_foreign" foreign key ("report_id") references "mirror_report" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "mirror_report_photo" add constraint "mirror_report_photo_report_id_foreign" foreign key ("report_id") references "mirror_report" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "mirror_audit_log" add constraint "mirror_audit_log_report_id_foreign" foreign key ("report_id") references "mirror_report" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "mirror_otp_request" add constraint "mirror_otp_request_user_id_foreign" foreign key ("user_id") references "mirror_user" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "mirror_report" drop constraint if exists "mirror_report_pothole_id_foreign";`);

    this.addSql(`alter table if exists "mirror_session" drop constraint if exists "mirror_session_user_id_foreign";`);

    this.addSql(`alter table if exists "mirror_report" drop constraint if exists "mirror_report_citizen_id_foreign";`);

    this.addSql(`alter table if exists "mirror_otp_request" drop constraint if exists "mirror_otp_request_user_id_foreign";`);

    this.addSql(`alter table if exists "mirror_status_history" drop constraint if exists "mirror_status_history_report_id_foreign";`);

    this.addSql(`alter table if exists "mirror_report_photo" drop constraint if exists "mirror_report_photo_report_id_foreign";`);

    this.addSql(`alter table if exists "mirror_audit_log" drop constraint if exists "mirror_audit_log_report_id_foreign";`);

    this.addSql(`drop table if exists "mirror_pothole" cascade;`);

    this.addSql(`drop table if exists "mirror_user" cascade;`);

    this.addSql(`drop table if exists "mirror_session" cascade;`);

    this.addSql(`drop table if exists "mirror_report" cascade;`);

    this.addSql(`drop table if exists "mirror_status_history" cascade;`);

    this.addSql(`drop table if exists "mirror_report_photo" cascade;`);

    this.addSql(`drop table if exists "mirror_audit_log" cascade;`);

    this.addSql(`drop table if exists "mirror_otp_request" cascade;`);
  }

}
