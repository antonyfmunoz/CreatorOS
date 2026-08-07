CREATE TABLE "post_polls" (
  "id" serial PRIMARY KEY,
  "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "question" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "post_polls_post_unique" UNIQUE("post_id")
);--> statement-breakpoint
CREATE TABLE "post_poll_options" (
  "id" serial PRIMARY KEY,
  "poll_id" integer NOT NULL REFERENCES "post_polls"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "position" integer NOT NULL,
  CONSTRAINT "post_poll_option_position_unique" UNIQUE("poll_id","position")
);--> statement-breakpoint
CREATE TABLE "post_poll_votes" (
  "id" serial PRIMARY KEY,
  "poll_id" integer NOT NULL REFERENCES "post_polls"("id") ON DELETE CASCADE,
  "option_id" integer NOT NULL REFERENCES "post_poll_options"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "post_poll_vote_user_unique" UNIQUE("poll_id","user_id")
);--> statement-breakpoint
CREATE INDEX "post_poll_options_poll_idx" ON "post_poll_options"("poll_id");--> statement-breakpoint
CREATE INDEX "post_poll_votes_poll_idx" ON "post_poll_votes"("poll_id");
