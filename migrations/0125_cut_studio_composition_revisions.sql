CREATE TABLE "cut_studio_composition_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "composition_id" uuid NOT NULL REFERENCES "cut_studio_compositions"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "cut_studio_projects"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "name" text NOT NULL,
  "mode" text NOT NULL,
  "manifest" json NOT NULL,
  "code_capsule" json,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_composition_revisions_composition_revision_unique" UNIQUE("composition_id", "revision")
);
--> statement-breakpoint
CREATE INDEX "cut_studio_composition_revisions_project_created_idx" ON "cut_studio_composition_revisions" USING btree ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX "cut_studio_composition_revisions_business_created_idx" ON "cut_studio_composition_revisions" USING btree ("business_id", "created_at");
--> statement-breakpoint
INSERT INTO "cut_studio_composition_revisions" ("composition_id", "project_id", "business_id", "owner_user_id", "revision", "name", "mode", "manifest", "code_capsule", "created_at")
SELECT "id", "project_id", "business_id", "owner_user_id", "revision", "name", "mode", "manifest", "code_capsule", "updated_at"
FROM "cut_studio_compositions"
ON CONFLICT ("composition_id", "revision") DO NOTHING;
