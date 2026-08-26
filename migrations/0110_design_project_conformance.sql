CREATE TABLE IF NOT EXISTS "design_project_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "design_projects"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "revision" integer,
  "payload" json NOT NULL DEFAULT '{}'::json,
  "evidence" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "design_project_events_project_created_idx"
  ON "design_project_events" ("project_id", "created_at");

CREATE INDEX IF NOT EXISTS "design_project_events_business_created_idx"
  ON "design_project_events" ("business_id", "created_at");

-- Existing canvas projects gain a sealed snapshot at their current revision.
-- The unique project/revision key keeps this replay-safe.
INSERT INTO "design_versions" (
  "project_id",
  "created_by_user_id",
  "revision",
  "label",
  "document",
  "review_status"
)
SELECT
  project."id",
  project."owner_user_id",
  project."revision",
  'Imported revision ' || project."revision",
  project."document",
  CASE
    WHEN project."status" = 'approved' THEN 'approved'
    WHEN project."status" = 'review' THEN 'in_review'
    ELSE 'draft'
  END
FROM "design_projects" project
ON CONFLICT ("project_id", "revision") DO NOTHING;

INSERT INTO "design_project_events" (
  "project_id",
  "business_id",
  "event_type",
  "actor_user_id",
  "revision",
  "payload",
  "evidence"
)
SELECT
  project."id",
  project."business_id",
  'design.project.imported',
  project."owner_user_id",
  project."revision",
  json_build_object('kind', project."kind", 'status', project."status"),
  json_build_object('source', 'design_projects.v1', 'migration', '0110_design_project_conformance')
FROM "design_projects" project
WHERE NOT EXISTS (
  SELECT 1
  FROM "design_project_events" event
  WHERE event."project_id" = project."id"
    AND event."event_type" = 'design.project.imported'
);
