ALTER TABLE "broadcast_sessions"
  ADD COLUMN IF NOT EXISTS "destination_ids" json NOT NULL DEFAULT '[]'::json;

UPDATE "broadcast_sessions"
SET "destination_ids" = json_build_array("destination_id")
WHERE "destination_id" IS NOT NULL
  AND "destination_ids"::jsonb = '[]'::jsonb;
