CREATE TABLE "cut_studio_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "public"."cut_studio_projects"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "revision" integer NOT NULL,
  "label" text NOT NULL,
  "edl" json NOT NULL,
  "transcript" json,
  "artifact_asset_id" uuid REFERENCES "public"."assets"("id") ON DELETE set null,
  "review_status" text DEFAULT 'pending' NOT NULL,
  "approved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_versions_review_status_check" CHECK ("review_status" IN ('pending', 'approved', 'changes_requested'))
);
CREATE INDEX "cut_studio_versions_project_created_idx" ON "cut_studio_versions" USING btree ("project_id", "created_at");

CREATE TABLE "cut_studio_review_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL REFERENCES "public"."cut_studio_versions"("id") ON DELETE cascade,
  "project_id" uuid NOT NULL REFERENCES "public"."cut_studio_projects"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "label" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_review_links_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "cut_studio_review_links_status_check" CHECK ("status" IN ('active', 'revoked'))
);
CREATE INDEX "cut_studio_review_links_project_created_idx" ON "cut_studio_review_links" USING btree ("project_id", "created_at");

CREATE TABLE "cut_studio_review_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_link_id" uuid NOT NULL REFERENCES "public"."cut_studio_review_links"("id") ON DELETE cascade,
  "version_id" uuid NOT NULL REFERENCES "public"."cut_studio_versions"("id") ON DELETE cascade,
  "author_name" text NOT NULL,
  "body" text NOT NULL,
  "position_ms" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  CONSTRAINT "cut_studio_review_comments_position_check" CHECK ("position_ms" >= 0 AND "position_ms" <= 43200000),
  CONSTRAINT "cut_studio_review_comments_status_check" CHECK ("status" IN ('open', 'resolved'))
);
CREATE INDEX "cut_studio_review_comments_version_position_idx" ON "cut_studio_review_comments" USING btree ("version_id", "position_ms");

CREATE TABLE "cut_studio_review_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_link_id" uuid NOT NULL REFERENCES "public"."cut_studio_review_links"("id") ON DELETE cascade,
  "version_id" uuid NOT NULL REFERENCES "public"."cut_studio_versions"("id") ON DELETE cascade,
  "reviewer_name" text NOT NULL,
  "decision" text NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_review_decisions_decision_check" CHECK ("decision" IN ('approved', 'changes_requested'))
);
CREATE INDEX "cut_studio_review_decisions_version_created_idx" ON "cut_studio_review_decisions" USING btree ("version_id", "created_at");
