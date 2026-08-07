CREATE TABLE IF NOT EXISTS "social_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "provider_account_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "scopes" json NOT NULL DEFAULT '[]'::json,
  "access_token_ciphertext" text,
  "refresh_token_ciphertext" text,
  "token_expires_at" timestamp,
  "last_validated_at" timestamp,
  "last_error_code" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "social_connection_provider_account_unique" UNIQUE("provider", "provider_account_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_connection_user_provider_idx" ON "social_connections" ("user_id", "provider");
