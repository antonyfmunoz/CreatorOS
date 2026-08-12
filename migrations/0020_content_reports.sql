CREATE TABLE IF NOT EXISTS "content_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reporter_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "reason" text NOT NULL,
  "details" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'open',
  "reviewer_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "content_reports_status_created_idx" ON "content_reports" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "content_reports_target_idx" ON "content_reports" ("target_type", "target_id");
