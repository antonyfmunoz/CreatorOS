CREATE TABLE IF NOT EXISTS "mobile_device_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "installation_id" text NOT NULL,
  "platform" text NOT NULL,
  "push_provider" text NOT NULL,
  "push_token_hash" text NOT NULL,
  "push_token_ciphertext" text NOT NULL,
  "app_version" text,
  "status" text DEFAULT 'active' NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp,
  CONSTRAINT "mobile_device_registrations_platform_check" CHECK ("platform" IN ('ios', 'android')),
  CONSTRAINT "mobile_device_registrations_provider_check" CHECK ("push_provider" IN ('apns', 'fcm')),
  CONSTRAINT "mobile_device_registrations_platform_provider_check" CHECK (
    ("platform" = 'ios' AND "push_provider" = 'apns') OR
    ("platform" = 'android' AND "push_provider" = 'fcm')
  ),
  CONSTRAINT "mobile_device_registrations_status_check" CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "mobile_device_registrations_user_installation_unique" UNIQUE("user_id", "installation_id")
);

CREATE INDEX IF NOT EXISTS "mobile_device_registrations_user_status_idx"
  ON "mobile_device_registrations" ("user_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "mobile_device_registrations_active_token_hash_unique"
  ON "mobile_device_registrations" ("push_token_hash")
  WHERE "status" = 'active';
