-- The original deployed baseline predated this table even though the
-- application already used membership-gated community access. Keep the repair
-- idempotent so existing environments and clean installs converge safely.
CREATE TABLE IF NOT EXISTS "community_memberships" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_community_unique" UNIQUE("user_id", "community_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_memberships_community_id_idx" ON "community_memberships" ("community_id");
--> statement-breakpoint
-- A previously failed create could leave an unowned, undiscoverable-in-practice
-- community behind. Its owner cannot be proven, so close it rather than expose
-- a space that nobody can administer.
UPDATE "communities" AS "community"
SET "archived_at" = now()
WHERE "community"."archived_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "community_memberships" AS "membership"
    WHERE "membership"."community_id" = "community"."id"
  );
