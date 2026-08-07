CREATE TABLE IF NOT EXISTS "channel_polls" (
  "id" serial PRIMARY KEY NOT NULL,
  "channel_id" integer NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "question" text NOT NULL,
  "closes_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_poll_options" (
  "id" serial PRIMARY KEY NOT NULL,
  "poll_id" integer NOT NULL REFERENCES "channel_polls"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_poll_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "poll_id" integer NOT NULL REFERENCES "channel_polls"("id") ON DELETE CASCADE,
  "option_id" integer NOT NULL REFERENCES "channel_poll_options"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "channel_poll_vote_user_unique" UNIQUE("poll_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_polls_channel_created_idx" ON "channel_polls" ("channel_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_poll_options_poll_idx" ON "channel_poll_options" ("poll_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_poll_votes_poll_idx" ON "channel_poll_votes" ("poll_id");
