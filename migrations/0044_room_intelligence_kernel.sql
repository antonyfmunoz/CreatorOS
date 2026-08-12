CREATE TABLE IF NOT EXISTS "community_room_intelligence_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL UNIQUE REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "updated_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "private_copilot_enabled" boolean NOT NULL DEFAULT false,
  "visible_ai_enabled" boolean NOT NULL DEFAULT false,
  "guest_briefs_enabled" boolean NOT NULL DEFAULT false,
  "engagement_insights_enabled" boolean NOT NULL DEFAULT false,
  "sales_coaching_enabled" boolean NOT NULL DEFAULT false,
  "recording_allowed" boolean NOT NULL DEFAULT false,
  "transcription_allowed" boolean NOT NULL DEFAULT false,
  "ai_analysis_allowed" boolean NOT NULL DEFAULT false,
  "disclosure_text" text NOT NULL DEFAULT 'This room may use explicitly enabled AI assistance. Active processing is disclosed before it begins, and you can decline or withdraw consent.',
  "retention_days" integer NOT NULL DEFAULT 30,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_room_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "capability" text NOT NULL,
  "decision" text NOT NULL,
  "disclosure_version" text NOT NULL DEFAULT 'room-intelligence-v1',
  "responded_at" timestamp NOT NULL DEFAULT now(),
  "withdrawn_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_room_consent_room_user_capability_unique" UNIQUE("room_id", "user_id", "capability")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_room_ai_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "mode" text NOT NULL,
  "audience_role" text NOT NULL DEFAULT 'owner',
  "instructions" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'configured',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_room_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "agent_profile_id" uuid REFERENCES "community_room_ai_profiles"("id") ON DELETE SET NULL,
  "target_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "insight_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "evidence" json NOT NULL DEFAULT '[]'::json,
  "confidence" double precision,
  "status" text NOT NULL DEFAULT 'draft',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_consents_room_user_idx" ON "community_room_consents" ("room_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_ai_profiles_room_status_idx" ON "community_room_ai_profiles" ("room_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_insights_room_status_idx" ON "community_room_insights" ("room_id", "status", "created_at");
