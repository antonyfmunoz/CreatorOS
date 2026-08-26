ALTER TABLE "creative_work_items"
  ADD COLUMN IF NOT EXISTS "parent_work_item_id" uuid;

DO $$ BEGIN
  ALTER TABLE "creative_work_items"
    ADD CONSTRAINT "creative_work_items_parent_work_item_id_fkey"
    FOREIGN KEY ("parent_work_item_id") REFERENCES "creative_work_items"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "creative_work_items_parent_idx"
  ON "creative_work_items" ("parent_work_item_id");

CREATE TABLE IF NOT EXISTS "creative_work_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "work_item_id" uuid NOT NULL REFERENCES "creative_work_items"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "from_status" text,
  "to_status" text,
  "version" integer,
  "payload" json NOT NULL DEFAULT '{}'::json,
  "evidence" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "creative_work_events_item_created_idx"
  ON "creative_work_events" ("work_item_id", "created_at");

CREATE INDEX IF NOT EXISTS "creative_work_events_business_created_idx"
  ON "creative_work_events" ("business_id", "created_at");

INSERT INTO "creative_work_events" (
  "work_item_id", "business_id", "event_type", "actor_user_id",
  "to_status", "version", "payload", "evidence"
)
SELECT
  item."id", item."business_id", 'task.imported', item."created_by_user_id",
  item."status", item."version",
  json_build_object('kind', item."kind", 'sourceType', item."source_type"),
  json_build_object('source', 'creative_work_items.v1', 'migration', '0111_task_conformance')
FROM "creative_work_items" item
WHERE NOT EXISTS (
  SELECT 1 FROM "creative_work_events" event
  WHERE event."work_item_id" = item."id" AND event."event_type" = 'task.imported'
);
