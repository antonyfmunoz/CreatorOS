ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "community_id" integer REFERENCES "communities"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_community_id_idx" ON "products" ("community_id");
