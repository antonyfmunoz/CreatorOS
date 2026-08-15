CREATE TABLE "design_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade, "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "name" text NOT NULL, "kind" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "brand_kit_id" uuid REFERENCES "broadcast_brand_kits"("id") ON DELETE set null, "document" json NOT NULL, "revision" integer NOT NULL DEFAULT 1, "status" text NOT NULL DEFAULT 'draft', "source_project_id" uuid REFERENCES "design_projects"("id") ON DELETE set null, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "design_projects_kind_check" CHECK ("kind" IN ('thumbnail','cover','carousel','social','product_art','lead_magnet','custom')), CONSTRAINT "design_projects_status_check" CHECK ("status" IN ('draft','review','approved','archived')), CONSTRAINT "design_projects_dimensions_check" CHECK ("width" BETWEEN 64 AND 10000 AND "height" BETWEEN 64 AND 10000)
);
CREATE INDEX "design_projects_business_updated_idx" ON "design_projects" ("business_id", "updated_at");
CREATE TABLE "design_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade, "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "name" text NOT NULL, "kind" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "document" json NOT NULL, "locked_element_ids" json NOT NULL DEFAULT '[]'::json, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "design_templates_business_name_unique" UNIQUE ("business_id", "name")
);
CREATE TABLE "design_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "project_id" uuid NOT NULL REFERENCES "design_projects"("id") ON DELETE cascade, "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "revision" integer NOT NULL, "label" text NOT NULL, "document" json NOT NULL, "review_status" text NOT NULL DEFAULT 'draft', "artifact_asset_id" uuid REFERENCES "assets"("id") ON DELETE set null, "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "design_versions_project_revision_unique" UNIQUE ("project_id", "revision"), CONSTRAINT "design_versions_review_check" CHECK ("review_status" IN ('draft','in_review','changes_requested','approved'))
);
CREATE TABLE "design_collaborators" (
  "project_id" uuid NOT NULL REFERENCES "design_projects"("id") ON DELETE cascade, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "role" text NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "design_collaborators_project_user_unique" UNIQUE ("project_id", "user_id"), CONSTRAINT "design_collaborators_role_check" CHECK ("role" IN ('viewer','reviewer','editor'))
);
CREATE TABLE "design_review_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "version_id" uuid NOT NULL REFERENCES "design_versions"("id") ON DELETE cascade, "token_hash" text NOT NULL UNIQUE, "label" text NOT NULL, "expires_at" timestamp NOT NULL, "revoked_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE "design_review_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "review_link_id" uuid NOT NULL REFERENCES "design_review_links"("id") ON DELETE cascade, "version_id" uuid NOT NULL REFERENCES "design_versions"("id") ON DELETE cascade, "reviewer_name" text NOT NULL, "body" text NOT NULL, "page_id" text NOT NULL, "x" double precision NOT NULL, "y" double precision NOT NULL, "resolved_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "design_review_comments_coordinates_check" CHECK ("x" BETWEEN 0 AND 1 AND "y" BETWEEN 0 AND 1)
);
CREATE TABLE "design_review_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "review_link_id" uuid NOT NULL REFERENCES "design_review_links"("id") ON DELETE cascade, "version_id" uuid NOT NULL REFERENCES "design_versions"("id") ON DELETE cascade, "reviewer_name" text NOT NULL, "decision" text NOT NULL, "note" text NOT NULL DEFAULT '', "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "design_review_decisions_check" CHECK ("decision" IN ('approved','changes_requested'))
);
CREATE TABLE "design_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "project_id" uuid NOT NULL REFERENCES "design_projects"("id") ON DELETE cascade, "version_id" uuid REFERENCES "design_versions"("id") ON DELETE set null, "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE restrict, "format" text NOT NULL, "page_id" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "design_exports_format_check" CHECK ("format" IN ('svg','png','jpeg','webp'))
);
CREATE INDEX "design_exports_project_created_idx" ON "design_exports" ("project_id", "created_at");
