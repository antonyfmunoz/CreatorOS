ALTER TABLE "community_memberships"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "moderation_reason" text,
  ADD COLUMN IF NOT EXISTS "moderated_at" timestamp;
--> statement-breakpoint
ALTER TABLE "community_memberships"
  DROP CONSTRAINT IF EXISTS "community_memberships_status_check";
--> statement-breakpoint
ALTER TABLE "community_memberships"
  ADD CONSTRAINT "community_memberships_status_check" CHECK ("status" IN ('active', 'muted', 'banned'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_memberships_community_status_idx"
  ON "community_memberships" ("community_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_moderation_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "target_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "actor_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_moderation_actions_community_created_idx"
  ON "community_moderation_actions" ("community_id", "created_at");
