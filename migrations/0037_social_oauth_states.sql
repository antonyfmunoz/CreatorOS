CREATE TABLE IF NOT EXISTS "social_oauth_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "state_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "social_oauth_states_state_hash_unique" UNIQUE("state_hash")
);

CREATE INDEX IF NOT EXISTS "social_oauth_states_provider_user_idx"
  ON "social_oauth_states" ("provider", "user_id");
