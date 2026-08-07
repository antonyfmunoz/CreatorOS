ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'draft';

UPDATE "products" SET "status" = 'published' WHERE "status" = 'draft';

CREATE INDEX IF NOT EXISTS "products_status_created_idx"
  ON "products" ("status", "created_at");
