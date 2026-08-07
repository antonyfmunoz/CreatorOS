CREATE TABLE IF NOT EXISTS "distribution_delivery_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "distribution_job_id" uuid NOT NULL REFERENCES "distribution_jobs"("id") ON DELETE CASCADE,
  "connection_id" uuid REFERENCES "social_connections"("id") ON DELETE SET NULL,
  "provider" text NOT NULL,
  "status" text DEFAULT 'waiting_for_connection' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "provider_content_id" text,
  "error_code" text,
  "error_message" text,
  "next_attempt_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "distribution_delivery_job_provider_unique" UNIQUE("distribution_job_id", "provider")
);

CREATE INDEX IF NOT EXISTS "distribution_delivery_status_idx"
  ON "distribution_delivery_attempts" ("status", "next_attempt_at");
