ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'public';
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_visibility_check";
ALTER TABLE "comments" ADD CONSTRAINT "comments_visibility_check" CHECK ("visibility" IN ('public','held','removed'));

CREATE TABLE IF NOT EXISTS "user_safety_controls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "target_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "muted" boolean NOT NULL DEFAULT false,
  "restricted" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "user_safety_controls_pair_unique" UNIQUE("actor_user_id","target_user_id"),
  CONSTRAINT "user_safety_controls_not_self" CHECK("actor_user_id" <> "target_user_id")
);

CREATE INDEX IF NOT EXISTS "user_safety_controls_actor_idx"
  ON "user_safety_controls"("actor_user_id", "muted", "restricted");
