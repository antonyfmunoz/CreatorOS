CREATE TABLE "broadcast_audience_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "author_user_id" integer,
  "provider" text DEFAULT 'native' NOT NULL,
  "external_message_id" text,
  "kind" text DEFAULT 'comment' NOT NULL,
  "author_name" text NOT NULL,
  "body" text NOT NULL,
  "action_url" text,
  "status" text DEFAULT 'visible' NOT NULL,
  "featured" boolean DEFAULT false NOT NULL,
  "moderated_by_user_id" integer,
  "moderated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_audience_messages_kind_check" CHECK ("kind" IN ('comment', 'cta')),
  CONSTRAINT "broadcast_audience_messages_status_check" CHECK ("status" IN ('visible', 'hidden')),
  CONSTRAINT "broadcast_audience_messages_provider_check" CHECK ("provider" IN ('native', 'youtube', 'instagram', 'facebook', 'twitch', 'x')),
  CONSTRAINT "broadcast_audience_messages_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "broadcast_audience_messages" ADD CONSTRAINT "broadcast_audience_messages_session_id_broadcast_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_audience_messages" ADD CONSTRAINT "broadcast_audience_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_audience_messages" ADD CONSTRAINT "broadcast_audience_messages_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_audience_messages_session_created_idx" ON "broadcast_audience_messages" USING btree ("session_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_audience_messages_provider_external_unique" ON "broadcast_audience_messages" USING btree ("session_id", "provider", "external_message_id");
