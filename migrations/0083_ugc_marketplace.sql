CREATE TABLE "ugc_creator_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
  "headline" text NOT NULL DEFAULT '', "bio" text NOT NULL DEFAULT '',
  "niches" json NOT NULL DEFAULT '[]'::json, "languages" json NOT NULL DEFAULT '[]'::json,
  "starting_rate_cents" integer NOT NULL DEFAULT 0, "currency" text NOT NULL DEFAULT 'usd',
  "availability" text NOT NULL DEFAULT 'available', "portfolio_public" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_creator_profiles_availability_check" CHECK ("availability" IN ('available','limited','unavailable')),
  CONSTRAINT "ugc_creator_profiles_rate_check" CHECK ("starting_rate_cents" >= 0),
  CONSTRAINT "ugc_creator_profiles_currency_check" CHECK ("currency" ~ '^[a-z]{3}$')
);
CREATE INDEX "ugc_creator_profiles_availability_idx" ON "ugc_creator_profiles" ("availability", "updated_at");

CREATE TABLE "ugc_portfolio_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE restrict,
  "title" text NOT NULL, "description" text NOT NULL DEFAULT '', "category" text NOT NULL, "format" text NOT NULL,
  "public" boolean NOT NULL DEFAULT true,
  "performance" json NOT NULL DEFAULT '{"impressions":0,"conversions":0,"attributedRevenueCents":0}'::json,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_portfolio_items_format_check" CHECK ("format" IN ('vertical_video','landscape_video','square_video','photo','audio','other'))
);
CREATE INDEX "ugc_portfolio_items_creator_updated_idx" ON "ugc_portfolio_items" ("creator_user_id", "updated_at");

CREATE TABLE "ugc_opportunities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE set null,
  "title" text NOT NULL, "description" text NOT NULL, "category" text NOT NULL,
  "platforms" json NOT NULL DEFAULT '[]'::json, "deliverables" json NOT NULL DEFAULT '[]'::json,
  "compensation_model" text NOT NULL, "fixed_fee_cents" integer NOT NULL DEFAULT 0,
  "commission_bps" integer NOT NULL DEFAULT 0, "currency" text NOT NULL DEFAULT 'usd',
  "application_deadline" timestamp, "content_due_at" timestamp,
  "usage_rights" json NOT NULL, "eligibility" json NOT NULL,
  "revision_limit" integer NOT NULL DEFAULT 2, "disclosure" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'draft', "published_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_opportunities_status_check" CHECK ("status" IN ('draft','open','paused','closed','completed','archived')),
  CONSTRAINT "ugc_opportunities_compensation_check" CHECK ("compensation_model" IN ('fixed','commission','hybrid','gifted')),
  CONSTRAINT "ugc_opportunities_amounts_check" CHECK ("fixed_fee_cents" >= 0 AND "commission_bps" BETWEEN 0 AND 10000 AND "revision_limit" BETWEEN 0 AND 20),
  CONSTRAINT "ugc_opportunities_compensation_terms_check" CHECK (
    ("compensation_model" = 'fixed' AND "fixed_fee_cents" > 0 AND "commission_bps" = 0) OR
    ("compensation_model" = 'commission' AND "fixed_fee_cents" = 0 AND "commission_bps" > 0) OR
    ("compensation_model" = 'hybrid' AND "fixed_fee_cents" > 0 AND "commission_bps" > 0) OR
    ("compensation_model" = 'gifted' AND "fixed_fee_cents" = 0 AND "commission_bps" = 0)
  )
);
CREATE INDEX "ugc_opportunities_status_published_idx" ON "ugc_opportunities" ("status", "published_at");
CREATE INDEX "ugc_opportunities_business_updated_idx" ON "ugc_opportunities" ("business_id", "updated_at");

CREATE TABLE "ugc_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL REFERENCES "ugc_opportunities"("id") ON DELETE cascade,
  "creator_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "pitch" text NOT NULL, "portfolio_item_ids" json NOT NULL DEFAULT '[]'::json,
  "preview_asset_id" uuid REFERENCES "assets"("id") ON DELETE set null,
  "proposed_fee_cents" integer, "status" text NOT NULL DEFAULT 'submitted',
  "submitted_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_applications_opportunity_creator_unique" UNIQUE ("opportunity_id", "creator_user_id"),
  CONSTRAINT "ugc_applications_status_check" CHECK ("status" IN ('submitted','shortlisted','accepted','rejected','withdrawn')),
  CONSTRAINT "ugc_applications_fee_check" CHECK ("proposed_fee_cents" IS NULL OR "proposed_fee_cents" >= 0)
);
CREATE INDEX "ugc_applications_opportunity_status_idx" ON "ugc_applications" ("opportunity_id", "status");
CREATE INDEX "ugc_applications_creator_updated_idx" ON "ugc_applications" ("creator_user_id", "updated_at");

CREATE TABLE "ugc_collaborations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "opportunity_id" uuid NOT NULL REFERENCES "ugc_opportunities"("id") ON DELETE restrict,
  "application_id" uuid NOT NULL UNIQUE REFERENCES "ugc_applications"("id") ON DELETE restrict,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE restrict,
  "creator_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "conversation_id" integer REFERENCES "conversations"("id") ON DELETE set null,
  "status" text NOT NULL DEFAULT 'in_progress', "compensation" json NOT NULL, "usage_rights" json NOT NULL,
  "revision_limit" integer NOT NULL DEFAULT 2, "accepted_at" timestamp NOT NULL DEFAULT now(),
  "approved_at" timestamp, "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_collaborations_status_check" CHECK ("status" IN ('in_progress','submitted','revision_requested','approved','live','completed','cancelled','disputed'))
);
CREATE INDEX "ugc_collaborations_creator_updated_idx" ON "ugc_collaborations" ("creator_user_id", "updated_at");
CREATE INDEX "ugc_collaborations_business_updated_idx" ON "ugc_collaborations" ("business_id", "updated_at");

CREATE TABLE "ugc_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collaboration_id" uuid NOT NULL REFERENCES "ugc_collaborations"("id") ON DELETE cascade,
  "creator_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE restrict,
  "version" integer NOT NULL, "caption" text NOT NULL DEFAULT '', "notes" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'submitted', "feedback" text,
  "reviewed_by_user_id" integer REFERENCES "users"("id") ON DELETE set null, "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_submissions_collaboration_version_unique" UNIQUE ("collaboration_id", "version"),
  CONSTRAINT "ugc_submissions_status_check" CHECK ("status" IN ('submitted','revision_requested','approved','rejected')),
  CONSTRAINT "ugc_submissions_version_check" CHECK ("version" > 0)
);
CREATE INDEX "ugc_submissions_collaboration_created_idx" ON "ugc_submissions" ("collaboration_id", "created_at");

CREATE TABLE "ugc_performance_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collaboration_id" uuid NOT NULL REFERENCES "ugc_collaborations"("id") ON DELETE cascade,
  "captured_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "idempotency_key" text NOT NULL UNIQUE,
  "source" text NOT NULL DEFAULT 'manual', "impressions" integer NOT NULL DEFAULT 0,
  "engagements" integer NOT NULL DEFAULT 0, "clicks" integer NOT NULL DEFAULT 0,
  "conversions" integer NOT NULL DEFAULT 0, "spend_cents" integer NOT NULL DEFAULT 0,
  "attributed_revenue_cents" integer NOT NULL DEFAULT 0, "commission_amount_cents" integer NOT NULL DEFAULT 0,
  "captured_at" timestamp NOT NULL DEFAULT now(), "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_performance_nonnegative_check" CHECK ("impressions" >= 0 AND "engagements" >= 0 AND "clicks" >= 0 AND "conversions" >= 0 AND "spend_cents" >= 0 AND "attributed_revenue_cents" >= 0 AND "commission_amount_cents" >= 0)
);
CREATE INDEX "ugc_performance_collaboration_captured_idx" ON "ugc_performance_snapshots" ("collaboration_id", "captured_at");

CREATE TABLE "ugc_earnings_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collaboration_id" uuid NOT NULL REFERENCES "ugc_collaborations"("id") ON DELETE restrict,
  "creator_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "kind" text NOT NULL, "source_type" text NOT NULL, "source_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL, "currency" text NOT NULL DEFAULT 'usd',
  "status" text NOT NULL DEFAULT 'pending', "provider_reference" text,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "ugc_earnings_ledger_source_unique" UNIQUE ("source_type", "source_id", "kind"),
  CONSTRAINT "ugc_earnings_ledger_kind_check" CHECK ("kind" IN ('fixed_fee','commission','bonus','adjustment')),
  CONSTRAINT "ugc_earnings_ledger_status_check" CHECK ("status" IN ('pending','approved','paid','reversed')),
  CONSTRAINT "ugc_earnings_ledger_amount_check" CHECK ("amount_cents" >= 0)
);
CREATE INDEX "ugc_earnings_ledger_creator_updated_idx" ON "ugc_earnings_ledger" ("creator_user_id", "updated_at");
