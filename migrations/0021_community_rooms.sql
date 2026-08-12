CREATE TABLE IF NOT EXISTS "community_rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "channel_id" integer REFERENCES "channels"("id") ON DELETE SET NULL,
  "host_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "starts_at" timestamp NOT NULL,
  "ended_at" timestamp,
  "status" text NOT NULL DEFAULT 'scheduled',
  "provider" text NOT NULL DEFAULT 'manual_link',
  "join_url" text,
  "recording_consent_required" boolean NOT NULL DEFAULT true,
  "recording_enabled" boolean NOT NULL DEFAULT false,
  "transcription_enabled" boolean NOT NULL DEFAULT false,
  "ai_assistance_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "community_room_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "author_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'members',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "community_room_action_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "assignee_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "due_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "community_rooms_schedule_idx" ON "community_rooms" ("community_id", "starts_at");
CREATE INDEX IF NOT EXISTS "community_room_notes_room_idx" ON "community_room_notes" ("room_id", "created_at");
CREATE INDEX IF NOT EXISTS "community_room_action_items_room_idx" ON "community_room_action_items" ("room_id", "completed_at");
