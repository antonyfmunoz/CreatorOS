CREATE TABLE "broadcast_session_markers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "owner_user_id" integer NOT NULL,
  "kind" text DEFAULT 'highlight' NOT NULL,
  "label" text DEFAULT 'Highlight' NOT NULL,
  "position_ms" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_session_markers_kind_check" CHECK ("kind" IN ('highlight', 'issue', 'note')),
  CONSTRAINT "broadcast_session_markers_position_check" CHECK ("position_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "broadcast_destination_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "destination_id" uuid,
  "owner_user_id" integer NOT NULL,
  "destination_name" text NOT NULL,
  "state" text DEFAULT 'starting' NOT NULL,
  "detail" text DEFAULT 'Encoder is starting' NOT NULL,
  "started_at" timestamp,
  "ended_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_destination_receipts_state_check" CHECK ("state" IN ('starting', 'live', 'complete', 'error', 'interrupted'))
);
--> statement-breakpoint
ALTER TABLE "broadcast_session_markers" ADD CONSTRAINT "broadcast_session_markers_session_id_broadcast_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_session_markers" ADD CONSTRAINT "broadcast_session_markers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_destination_receipts" ADD CONSTRAINT "broadcast_destination_receipts_session_id_broadcast_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_destination_receipts" ADD CONSTRAINT "broadcast_destination_receipts_destination_id_broadcast_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."broadcast_destinations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_destination_receipts" ADD CONSTRAINT "broadcast_destination_receipts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_session_markers_session_position_idx" ON "broadcast_session_markers" USING btree ("session_id", "position_ms");
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_destination_receipts_session_destination_unique" ON "broadcast_destination_receipts" USING btree ("session_id", "destination_id");
--> statement-breakpoint
CREATE INDEX "broadcast_destination_receipts_session_updated_idx" ON "broadcast_destination_receipts" USING btree ("session_id", "updated_at");
