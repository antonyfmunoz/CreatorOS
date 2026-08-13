CREATE TABLE "broadcast_session_tracks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "owner_user_id" integer NOT NULL,
  "asset_id" uuid NOT NULL,
  "source_id" text NOT NULL,
  "source_name" text NOT NULL,
  "source_type" text NOT NULL,
  "mime_type" text NOT NULL,
  "duration_ms" integer NOT NULL,
  "size_bytes" integer NOT NULL,
  "quality" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_session_tracks_session_source_unique" UNIQUE("session_id", "source_id"),
  CONSTRAINT "broadcast_session_tracks_source_id_check" CHECK (char_length(trim("source_id")) BETWEEN 1 AND 64),
  CONSTRAINT "broadcast_session_tracks_source_name_check" CHECK (char_length(trim("source_name")) BETWEEN 1 AND 120),
  CONSTRAINT "broadcast_session_tracks_source_type_check" CHECK ("source_type" IN ('camera', 'screen', 'microphone')),
  CONSTRAINT "broadcast_session_tracks_mime_type_check" CHECK ("mime_type" IN ('video/webm', 'video/webm;codecs=vp8,opus', 'audio/webm', 'audio/webm;codecs=opus')),
  CONSTRAINT "broadcast_session_tracks_duration_check" CHECK ("duration_ms" > 0 AND "duration_ms" <= 28800000),
  CONSTRAINT "broadcast_session_tracks_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 2147483647)
);
--> statement-breakpoint
ALTER TABLE "broadcast_session_tracks" ADD CONSTRAINT "broadcast_session_tracks_session_id_broadcast_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_session_tracks" ADD CONSTRAINT "broadcast_session_tracks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_session_tracks" ADD CONSTRAINT "broadcast_session_tracks_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_session_tracks_session_created_idx" ON "broadcast_session_tracks" USING btree ("session_id", "created_at");
--> statement-breakpoint
CREATE INDEX "broadcast_session_tracks_owner_created_idx" ON "broadcast_session_tracks" USING btree ("owner_user_id", "created_at");
