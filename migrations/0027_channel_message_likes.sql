CREATE TABLE IF NOT EXISTS "channel_message_likes" (
  "id" serial PRIMARY KEY NOT NULL,
  "message_id" integer NOT NULL REFERENCES "channel_messages"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "channel_message_like_unique" UNIQUE("message_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_message_likes_message_idx" ON "channel_message_likes" ("message_id");
