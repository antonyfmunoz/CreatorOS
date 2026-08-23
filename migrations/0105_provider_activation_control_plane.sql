CREATE TABLE "provider_activation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "environment" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "summary" text NOT NULL DEFAULT '',
  "started_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "abandoned_at" timestamp,
  "closed_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "provider_activation_runs_provider_check" CHECK ("provider" IN (
    'media_delivery', 'email_delivery', 'push_delivery', 'podcast_directories',
    'youtube_distribution', 'facebook_distribution', 'instagram_distribution', 'tiktok_distribution', 'x_distribution',
    'instagram_inbox', 'messenger_inbox', 'whatsapp_inbox', 'x_inbox',
    'remote_guests', 'transcription', 'realtime_ai', 'relationship_ai', 'cloned_voice',
    'broadcast_destinations', 'stripe_platform_commerce', 'stripe_creator_payouts', 'umh_federation'
  )),
  CONSTRAINT "provider_activation_runs_environment_check" CHECK ("environment" IN ('sandbox', 'staging', 'production')),
  CONSTRAINT "provider_activation_runs_status_check" CHECK ("status" IN ('draft', 'qualified', 'abandoned')),
  CONSTRAINT "provider_activation_runs_completion_check" CHECK ((("status" = 'qualified') = ("completed_at" IS NOT NULL)) AND (("status" = 'abandoned') = ("abandoned_at" IS NOT NULL))),
  CONSTRAINT "provider_activation_runs_id_business_unique" UNIQUE ("id", "business_id")
);

CREATE INDEX "provider_activation_runs_business_provider_environment_idx"
  ON "provider_activation_runs" ("business_id", "provider", "environment", "started_at");

CREATE TABLE "provider_activation_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "outcome" text NOT NULL,
  "evidence_url" text,
  "summary" text NOT NULL,
  "observed_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp,
  "recorded_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "provider_activation_evidence_run_business_fk" FOREIGN KEY ("run_id", "business_id") REFERENCES "provider_activation_runs"("id", "business_id") ON DELETE CASCADE,
  CONSTRAINT "provider_activation_evidence_stage_check" CHECK ("stage" IN (
    'connect', 'credential_custody', 'refresh_revoke', 'inbound', 'outbound',
    'webhook_signature', 'idempotency', 'rate_limit', 'retry', 'dead_letter',
    'receipt', 'privacy_export', 'deletion', 'failure_recovery'
  )),
  CONSTRAINT "provider_activation_evidence_outcome_check" CHECK ("outcome" IN ('passed', 'failed', 'blocked')),
  CONSTRAINT "provider_activation_evidence_passed_reference_check" CHECK ("outcome" <> 'passed' OR "evidence_url" IS NOT NULL),
  CONSTRAINT "provider_activation_evidence_expiry_check" CHECK ("expires_at" IS NULL OR "expires_at" > "observed_at")
);

CREATE INDEX "provider_activation_evidence_run_stage_created_idx"
  ON "provider_activation_evidence" ("run_id", "stage", "created_at");
CREATE INDEX "provider_activation_evidence_business_created_idx"
  ON "provider_activation_evidence" ("business_id", "created_at");
