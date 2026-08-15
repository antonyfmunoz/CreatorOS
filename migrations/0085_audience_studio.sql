CREATE TABLE "audience_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "name" text NOT NULL, "public_id" text NOT NULL UNIQUE, "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '', "fields" json NOT NULL DEFAULT '[]'::json,
  "tags" json NOT NULL DEFAULT '[]'::json, "consent_purpose" text NOT NULL DEFAULT 'marketing',
  "disclosure_version" text NOT NULL DEFAULT 'v1', "success_message" text NOT NULL DEFAULT 'You are subscribed.',
  "status" text NOT NULL DEFAULT 'draft', "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "audience_forms_business_name_unique" UNIQUE ("business_id", "name"),
  CONSTRAINT "audience_forms_status_check" CHECK ("status" IN ('draft','published','archived'))
);
CREATE INDEX "audience_forms_status_idx" ON "audience_forms" ("business_id", "status");

CREATE TABLE "audience_form_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "form_id" uuid NOT NULL REFERENCES "audience_forms"("id") ON DELETE cascade,
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE cascade,
  "email" text NOT NULL, "values" json NOT NULL DEFAULT '{}'::json,
  "consent_granted" boolean NOT NULL DEFAULT false, "source" text NOT NULL DEFAULT 'form',
  "submitted_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "audience_form_submissions_form_relationship_unique" UNIQUE ("form_id", "relationship_id")
);
CREATE INDEX "audience_form_submissions_form_idx" ON "audience_form_submissions" ("form_id", "submitted_at");

CREATE TABLE "audience_landing_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "form_id" uuid REFERENCES "audience_forms"("id") ON DELETE set null,
  "name" text NOT NULL, "public_id" text NOT NULL UNIQUE, "headline" text NOT NULL,
  "subheadline" text NOT NULL DEFAULT '', "sections" json NOT NULL DEFAULT '[]'::json,
  "theme" json NOT NULL DEFAULT '{}'::json, "seo_title" text, "seo_description" text,
  "status" text NOT NULL DEFAULT 'draft', "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "audience_landing_pages_business_name_unique" UNIQUE ("business_id", "name"),
  CONSTRAINT "audience_landing_pages_status_check" CHECK ("status" IN ('draft','published','archived'))
);
CREATE INDEX "audience_landing_pages_status_idx" ON "audience_landing_pages" ("business_id", "status");

CREATE TABLE "newsletter_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "name" text NOT NULL, "kind" text NOT NULL, "content" json NOT NULL DEFAULT '{}'::json,
  "status" text NOT NULL DEFAULT 'active', "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_blocks_business_name_unique" UNIQUE ("business_id", "name"),
  CONSTRAINT "newsletter_blocks_kind_check" CHECK ("kind" IN ('text','heading','image','button','divider','social','product','signature')),
  CONSTRAINT "newsletter_blocks_status_check" CHECK ("status" IN ('active','archived'))
);

CREATE TABLE "newsletter_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "segment_id" uuid REFERENCES "audience_segments"("id") ON DELETE set null,
  "name" text NOT NULL, "subject" text NOT NULL, "preview_text" text NOT NULL DEFAULT '',
  "content" json NOT NULL DEFAULT '[]'::json, "variants" json NOT NULL DEFAULT '[]'::json,
  "status" text NOT NULL DEFAULT 'draft', "scheduled_at" timestamp, "sent_at" timestamp,
  "winner_variant" text, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_issues_status_check" CHECK ("status" IN ('draft','review','scheduled','sending','sent','paused','cancelled'))
);
CREATE INDEX "newsletter_issues_status_idx" ON "newsletter_issues" ("business_id", "status", "scheduled_at");

CREATE TABLE "newsletter_sequences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "name" text NOT NULL, "trigger" json NOT NULL DEFAULT '{}'::json,
  "status" text NOT NULL DEFAULT 'draft', "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_sequences_business_name_unique" UNIQUE ("business_id", "name"),
  CONSTRAINT "newsletter_sequences_status_check" CHECK ("status" IN ('draft','active','paused','archived'))
);

CREATE TABLE "newsletter_sequence_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_id" uuid NOT NULL REFERENCES "newsletter_sequences"("id") ON DELETE cascade,
  "position" integer NOT NULL, "delay_minutes" integer NOT NULL DEFAULT 0,
  "subject" text NOT NULL, "preview_text" text NOT NULL DEFAULT '', "content" json NOT NULL DEFAULT '[]'::json,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_sequence_steps_position_unique" UNIQUE ("sequence_id", "position"),
  CONSTRAINT "newsletter_sequence_steps_position_check" CHECK ("position" > 0),
  CONSTRAINT "newsletter_sequence_steps_delay_check" CHECK ("delay_minutes" >= 0)
);

CREATE TABLE "newsletter_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence_id" uuid NOT NULL REFERENCES "newsletter_sequences"("id") ON DELETE cascade,
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE cascade,
  "status" text NOT NULL DEFAULT 'active', "next_step_position" integer NOT NULL DEFAULT 1,
  "next_run_at" timestamp NOT NULL DEFAULT now(), "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_enrollments_sequence_relationship_unique" UNIQUE ("sequence_id", "relationship_id"),
  CONSTRAINT "newsletter_enrollments_status_check" CHECK ("status" IN ('active','paused','completed','cancelled','suppressed'))
);
CREATE INDEX "newsletter_enrollments_due_idx" ON "newsletter_enrollments" ("status", "next_run_at");

CREATE TABLE "audience_preference_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE, "expires_at" timestamp NOT NULL, "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "audience_preference_tokens_relationship_idx" ON "audience_preference_tokens" ("business_id", "relationship_id", "expires_at");
