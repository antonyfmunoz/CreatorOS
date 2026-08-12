CREATE TABLE IF NOT EXISTS "community_room_attendees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "community_rooms"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'going',
  "checked_in_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "community_room_attendee_room_user_unique" UNIQUE("room_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_attendees_room_status_idx" ON "community_room_attendees" ("room_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_room_attendees_user_idx" ON "community_room_attendees" ("user_id", "updated_at");
