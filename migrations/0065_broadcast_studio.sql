CREATE TABLE "broadcast_studios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL,
  "business_id" uuid NOT NULL,
  "name" text NOT NULL,
  "config" json NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_studios_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "broadcast_destinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL,
  "business_id" uuid NOT NULL,
  "name" text NOT NULL,
  "protocol" text NOT NULL,
  "ingest_url" text NOT NULL,
  "stream_key_ciphertext" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_destinations_protocol_check" CHECK ("protocol" IN ('rtmp', 'rtmps', 'srt')),
  CONSTRAINT "broadcast_destinations_status_check" CHECK ("status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "broadcast_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "studio_id" uuid NOT NULL,
  "owner_user_id" integer NOT NULL,
  "business_id" uuid NOT NULL,
  "destination_id" uuid,
  "recording_asset_id" uuid,
  "output_mode" text NOT NULL,
  "source_mode" text NOT NULL,
  "state" text DEFAULT 'starting' NOT NULL,
  "runtime_machine_id" text,
  "health" json DEFAULT '{}'::json NOT NULL,
  "error_code" text,
  "error_message" text,
  "started_at" timestamp,
  "ended_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_sessions_output_mode_check" CHECK ("output_mode" IN ('stream', 'recording')),
  CONSTRAINT "broadcast_sessions_source_mode_check" CHECK ("source_mode" IN ('browser', 'test_pattern')),
  CONSTRAINT "broadcast_sessions_state_check" CHECK ("state" IN ('starting', 'live', 'stopping', 'complete', 'error', 'interrupted'))
);
--> statement-breakpoint
ALTER TABLE "broadcast_studios" ADD CONSTRAINT "broadcast_studios_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_studios" ADD CONSTRAINT "broadcast_studios_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_destinations" ADD CONSTRAINT "broadcast_destinations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_destinations" ADD CONSTRAINT "broadcast_destinations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_sessions" ADD CONSTRAINT "broadcast_sessions_studio_id_broadcast_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."broadcast_studios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_sessions" ADD CONSTRAINT "broadcast_sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_sessions" ADD CONSTRAINT "broadcast_sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_sessions" ADD CONSTRAINT "broadcast_sessions_destination_id_broadcast_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."broadcast_destinations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_sessions" ADD CONSTRAINT "broadcast_sessions_recording_asset_id_assets_id_fk" FOREIGN KEY ("recording_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_studios_owner_updated_idx" ON "broadcast_studios" USING btree ("owner_user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "broadcast_destinations_owner_updated_idx" ON "broadcast_destinations" USING btree ("owner_user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "broadcast_sessions_studio_created_idx" ON "broadcast_sessions" USING btree ("studio_id", "created_at");
--> statement-breakpoint
CREATE INDEX "broadcast_sessions_owner_created_idx" ON "broadcast_sessions" USING btree ("owner_user_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_sessions_one_active_per_owner" ON "broadcast_sessions" USING btree ("owner_user_id") WHERE "state" IN ('starting', 'live', 'stopping');
