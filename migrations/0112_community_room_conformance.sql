ALTER TABLE "community_room_notes"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'note';

CREATE TABLE IF NOT EXISTS "community_room_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "community_id" integer NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "subject_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "payload" json NOT NULL DEFAULT '{}'::json,
  "evidence" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "community_room_events_room_created_idx"
  ON "community_room_events" ("room_id", "created_at");
CREATE INDEX IF NOT EXISTS "community_room_events_community_created_idx"
  ON "community_room_events" ("community_id", "created_at");

CREATE TABLE IF NOT EXISTS "community_room_guest_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "invited_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "guest_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "label" text NOT NULL,
  "email" text,
  "token_hash" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'invited',
  "membership_granted" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "admitted_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "community_room_guest_invites_room_status_idx"
  ON "community_room_guest_invites" ("room_id", "status", "created_at");

INSERT INTO "community_room_events" (
  "room_id", "community_id", "event_type", "actor_user_id", "payload", "evidence"
)
SELECT
  room."id", room."community_id", 'community.room.imported', room."host_user_id",
  json_build_object('status', room."status", 'provider', room."provider"),
  json_build_object('source', 'community_rooms.v1', 'migration', '0112_community_room_conformance')
FROM "community_rooms" room
WHERE NOT EXISTS (
  SELECT 1 FROM "community_room_events" event
  WHERE event."room_id" = room."id" AND event."event_type" = 'community.room.imported'
);
