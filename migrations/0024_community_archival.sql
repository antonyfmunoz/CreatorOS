ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
CREATE INDEX IF NOT EXISTS "communities_archived_at_idx" ON "communities" ("archived_at");
