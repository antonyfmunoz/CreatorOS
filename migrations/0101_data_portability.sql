CREATE TABLE IF NOT EXISTS "data_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "requested_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "source_system" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "payload_hash" text NOT NULL,
  "schema_version" text NOT NULL,
  "status" text NOT NULL DEFAULT 'completed',
  "summary" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_import_jobs_business_idempotency_unique" ON "data_import_jobs" ("business_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "data_import_jobs_business_created_idx" ON "data_import_jobs" ("business_id", "created_at");

CREATE TABLE IF NOT EXISTS "data_import_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "data_import_jobs"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "source_system" text NOT NULL,
  "domain" text NOT NULL,
  "source_id" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "checksum" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "data_import_records_source_unique" ON "data_import_records" ("business_id", "source_system", "domain", "source_id");
CREATE INDEX IF NOT EXISTS "data_import_records_job_idx" ON "data_import_records" ("job_id");
