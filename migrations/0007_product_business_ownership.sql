ALTER TABLE "products" ADD COLUMN "business_id" uuid;
--> statement-breakpoint
INSERT INTO "businesses" ("owner_user_id", "name", "handle", "description", "status", "is_default")
SELECT u.id, u.display_name || '''s Business', 'creator_' || u.id || '_migrated', '', 'active', true
FROM "users" u
WHERE EXISTS (SELECT 1 FROM "products" p WHERE p.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM "businesses" b WHERE b.owner_user_id = u.id AND b.is_default = true);
--> statement-breakpoint
INSERT INTO "business_members" ("business_id", "user_id", "role")
SELECT b.id, b.owner_user_id, 'owner'
FROM "businesses" b
WHERE b.is_default = true
ON CONFLICT ("business_id", "user_id") DO NOTHING;
--> statement-breakpoint
UPDATE "products" p
SET "business_id" = b.id
FROM "businesses" b
WHERE p."user_id" = b."owner_user_id"
  AND b."is_default" = true
  AND p."business_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "products_business_id_idx" ON "products" USING btree ("business_id");
