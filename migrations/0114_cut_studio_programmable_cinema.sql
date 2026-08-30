CREATE TABLE IF NOT EXISTS "cut_studio_compositions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "cut_studio_projects"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "mode" text NOT NULL DEFAULT 'declarative',
  "manifest" json NOT NULL,
  "code_capsule" json,
  "revision" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
  ,CONSTRAINT "cut_studio_compositions_mode_check" CHECK ("mode" IN ('declarative', 'sandboxed_tsx'))
  ,CONSTRAINT "cut_studio_compositions_status_check" CHECK ("status" IN ('active', 'archived'))
  ,CONSTRAINT "cut_studio_compositions_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "cut_studio_compositions_project_updated_idx" ON "cut_studio_compositions" ("project_id", "updated_at");
CREATE INDEX IF NOT EXISTS "cut_studio_compositions_business_updated_idx" ON "cut_studio_compositions" ("business_id", "updated_at");

CREATE TABLE IF NOT EXISTS "cut_studio_production_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "cut_studio_projects"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "brief" json NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
  ,CONSTRAINT "cut_studio_production_plans_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "cut_studio_production_plans_project_unique" ON "cut_studio_production_plans" ("project_id");
CREATE INDEX IF NOT EXISTS "cut_studio_production_plans_business_updated_idx" ON "cut_studio_production_plans" ("business_id", "updated_at");

CREATE TABLE IF NOT EXISTS "cut_studio_production_elements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "cut_studio_production_plans"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "spec" json NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
  ,CONSTRAINT "cut_studio_production_elements_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "cut_studio_production_elements_plan_updated_idx" ON "cut_studio_production_elements" ("plan_id", "updated_at");

CREATE TABLE IF NOT EXISTS "cut_studio_shots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "cut_studio_production_plans"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "spec" json NOT NULL,
  "selected_variant_id" uuid,
  "revision" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'planned',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
  ,CONSTRAINT "cut_studio_shots_status_check" CHECK ("status" IN ('planned', 'generating', 'review', 'selected', 'rejected'))
  ,CONSTRAINT "cut_studio_shots_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "cut_studio_shots_plan_sequence_unique" ON "cut_studio_shots" ("plan_id", "sequence");
CREATE INDEX IF NOT EXISTS "cut_studio_shots_plan_updated_idx" ON "cut_studio_shots" ("plan_id", "updated_at");

CREATE TABLE IF NOT EXISTS "cut_studio_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shot_id" uuid NOT NULL REFERENCES "cut_studio_shots"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "request" json NOT NULL,
  "state" text NOT NULL DEFAULT 'provider_pending',
  "progress" double precision NOT NULL DEFAULT 0,
  "detail" text NOT NULL DEFAULT 'Awaiting an activated model provider',
  "provider_job_id" text,
  "idempotency_key" text NOT NULL,
  "attempt" integer NOT NULL DEFAULT 0,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
  ,CONSTRAINT "cut_studio_generation_jobs_state_check" CHECK ("state" IN ('provider_pending', 'queued', 'running', 'done', 'error', 'cancelled'))
  ,CONSTRAINT "cut_studio_generation_jobs_progress_check" CHECK ("progress" >= 0 AND "progress" <= 1)
  ,CONSTRAINT "cut_studio_generation_jobs_attempt_check" CHECK ("attempt" >= 0 AND "attempt" <= 20)
);
CREATE UNIQUE INDEX IF NOT EXISTS "cut_studio_generation_jobs_business_idempotency_unique" ON "cut_studio_generation_jobs" ("business_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "cut_studio_generation_jobs_shot_created_idx" ON "cut_studio_generation_jobs" ("shot_id", "created_at");
CREATE INDEX IF NOT EXISTS "cut_studio_generation_jobs_state_updated_idx" ON "cut_studio_generation_jobs" ("state", "updated_at");

CREATE TABLE IF NOT EXISTS "cut_studio_generative_workflows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "cut_studio_projects"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workflow" json NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
  ,CONSTRAINT "cut_studio_generative_workflows_status_check" CHECK ("status" IN ('active', 'archived'))
  ,CONSTRAINT "cut_studio_generative_workflows_revision_check" CHECK ("revision" > 0)
);
CREATE INDEX IF NOT EXISTS "cut_studio_generative_workflows_project_updated_idx" ON "cut_studio_generative_workflows" ("project_id", "updated_at");
CREATE INDEX IF NOT EXISTS "cut_studio_generative_workflows_business_updated_idx" ON "cut_studio_generative_workflows" ("business_id", "updated_at");

CREATE TABLE IF NOT EXISTS "cut_studio_shot_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shot_id" uuid NOT NULL REFERENCES "cut_studio_shots"("id") ON DELETE CASCADE,
  "generation_job_id" uuid REFERENCES "cut_studio_generation_jobs"("id") ON DELETE SET NULL,
  "asset_id" uuid REFERENCES "assets"("id") ON DELETE RESTRICT,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "seed" integer,
  "status" text NOT NULL DEFAULT 'candidate',
  "provenance" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now()
  ,CONSTRAINT "cut_studio_shot_variants_status_check" CHECK ("status" IN ('candidate', 'selected', 'rejected', 'superseded'))
);
CREATE INDEX IF NOT EXISTS "cut_studio_shot_variants_shot_created_idx" ON "cut_studio_shot_variants" ("shot_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cut_studio_shots_selected_variant_fk'
  ) THEN
    ALTER TABLE "cut_studio_shots"
      ADD CONSTRAINT "cut_studio_shots_selected_variant_fk"
      FOREIGN KEY ("selected_variant_id") REFERENCES "cut_studio_shot_variants"("id") ON DELETE SET NULL;
  END IF;
END $$;
