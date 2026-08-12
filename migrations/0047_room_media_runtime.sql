CREATE TABLE IF NOT EXISTS "community_room_recordings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "requested_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL DEFAULT 'livekit_egress',
  "provider_recording_id" text UNIQUE,
  "status" text NOT NULL DEFAULT 'starting',
  "storage_key" text NOT NULL,
  "mime_type" text NOT NULL DEFAULT 'video/mp4',
  "started_at" timestamp,
  "stopped_at" timestamp,
  "duration_ms" integer,
  "size_bytes" bigint,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_recordings_room_created_idx"
  ON "community_room_recordings" ("room_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_room_recordings_one_active_per_room"
  ON "community_room_recordings" ("room_id")
  WHERE "status" IN ('starting', 'active', 'stopping');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_room_transcript_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "provider_segment_id" text NOT NULL,
  "speaker_identity" text NOT NULL,
  "speaker_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "text" text NOT NULL,
  "start_time_ms" integer,
  "end_time_ms" integer,
  "is_final" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_room_transcript_room_segment_unique"
    UNIQUE("room_id", "provider_segment_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_transcript_room_created_idx"
  ON "community_room_transcript_segments" ("room_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_room_agent_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "agent_profile_id" uuid REFERENCES "community_room_ai_profiles"("id") ON DELETE SET NULL,
  "started_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "kind" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'livekit_agents',
  "provider_session_id" text UNIQUE,
  "status" text NOT NULL DEFAULT 'starting',
  "started_at" timestamp,
  "stopped_at" timestamp,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_agent_sessions_room_status_idx"
  ON "community_room_agent_sessions" ("room_id", "status", "created_at");
