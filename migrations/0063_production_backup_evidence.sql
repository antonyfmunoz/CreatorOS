CREATE TABLE IF NOT EXISTS "production_backups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "date_key" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "storage_key" text,
  "manifest_storage_key" text,
  "size_bytes" bigint DEFAULT 0 NOT NULL,
  "sha256" text,
  "failure_code" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "production_backups_date_key_unique" ON "production_backups" USING btree ("date_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_backups_status_started_idx" ON "production_backups" USING btree ("status", "started_at");
