CREATE TABLE "broadcast_capture_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"owner_user_id" integer NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"capabilities" json NOT NULL,
	"configuration" json NOT NULL,
	"device_secret_hash" text NOT NULL,
	"last_telemetry" json,
	"last_directive" json,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_capture_nodes_kind_check" CHECK ("kind" IN ('android', 'ios', 'desktop', 'remote_guest', 'encoder')),
	CONSTRAINT "broadcast_capture_nodes_status_check" CHECK ("status" IN ('ready', 'connecting', 'live', 'degraded', 'reconnecting', 'offline', 'stopped', 'error', 'revoked')),
	CONSTRAINT "broadcast_capture_nodes_last_sequence_check" CHECK ("last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "broadcast_capture_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"owner_user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_capture_telemetry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"state" text NOT NULL,
	"snapshot" json NOT NULL,
	"directive" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_capture_telemetry_sequence_check" CHECK ("sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "broadcast_capture_nodes" ADD CONSTRAINT "broadcast_capture_nodes_studio_id_broadcast_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."broadcast_studios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_capture_nodes" ADD CONSTRAINT "broadcast_capture_nodes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_capture_nodes" ADD CONSTRAINT "broadcast_capture_nodes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_capture_invitations" ADD CONSTRAINT "broadcast_capture_invitations_studio_id_broadcast_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."broadcast_studios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_capture_invitations" ADD CONSTRAINT "broadcast_capture_invitations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_capture_telemetry" ADD CONSTRAINT "broadcast_capture_telemetry_node_id_broadcast_capture_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."broadcast_capture_nodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_capture_nodes_device_secret_unique" ON "broadcast_capture_nodes" USING btree ("device_secret_hash");
--> statement-breakpoint
CREATE INDEX "broadcast_capture_nodes_studio_updated_idx" ON "broadcast_capture_nodes" USING btree ("studio_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "broadcast_capture_nodes_owner_updated_idx" ON "broadcast_capture_nodes" USING btree ("owner_user_id", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_capture_invitations_token_hash_unique" ON "broadcast_capture_invitations" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "broadcast_capture_invitations_studio_expires_idx" ON "broadcast_capture_invitations" USING btree ("studio_id", "expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_capture_telemetry_node_sequence_unique" ON "broadcast_capture_telemetry" USING btree ("node_id", "sequence");
--> statement-breakpoint
CREATE INDEX "broadcast_capture_telemetry_node_created_idx" ON "broadcast_capture_telemetry" USING btree ("node_id", "created_at");
