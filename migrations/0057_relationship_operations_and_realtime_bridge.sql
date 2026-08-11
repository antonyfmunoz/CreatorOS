CREATE TABLE "relationship_tenant_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL UNIQUE,
  "plan_key" text DEFAULT 'foundation' NOT NULL,
  "enforcement_mode" text DEFAULT 'enforce' NOT NULL,
  "monthly_outbound_messages" integer DEFAULT 10000 NOT NULL,
  "monthly_ai_runs" integer DEFAULT 1000 NOT NULL,
  "monthly_voice_seconds" integer DEFAULT 3600 NOT NULL,
  "monthly_realtime_minutes" integer DEFAULT 600 NOT NULL,
  "max_active_connections" integer DEFAULT 10 NOT NULL,
  "provider_payload_retention_days" integer DEFAULT 30 NOT NULL,
  "audit_retention_days" integer DEFAULT 365 NOT NULL,
  "realtime_artifact_retention_days" integer DEFAULT 30 NOT NULL,
  "updated_by_user_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_usage_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "metric" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "cost_units" integer DEFAULT 0 NOT NULL,
  "provider" text,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "period_start" timestamp NOT NULL,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_operational_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "severity" text DEFAULT 'warning' NOT NULL,
  "category" text NOT NULL,
  "fingerprint" text NOT NULL,
  "title" text NOT NULL,
  "detail" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_room_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "room_id" uuid NOT NULL UNIQUE,
  "relationship_id" uuid NOT NULL,
  "conversation_id" uuid,
  "purpose" text DEFAULT 'relationship_meeting' NOT NULL,
  "context_policy" json DEFAULT '{"includeTimeline":true,"includePrivateNotes":false}'::json NOT NULL,
  "created_by_user_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "relationship_tenant_policies" ADD CONSTRAINT "relationship_tenant_policies_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_tenant_policies" ADD CONSTRAINT "relationship_tenant_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_usage_ledger" ADD CONSTRAINT "relationship_usage_ledger_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_operational_alerts" ADD CONSTRAINT "relationship_operational_alerts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_room_bindings" ADD CONSTRAINT "relationship_room_bindings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_room_bindings" ADD CONSTRAINT "relationship_room_bindings_room_id_community_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."community_rooms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_room_bindings" ADD CONSTRAINT "relationship_room_bindings_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_room_bindings" ADD CONSTRAINT "relationship_room_bindings_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "relationship_room_bindings" ADD CONSTRAINT "relationship_room_bindings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_usage_business_key_unique" ON "relationship_usage_ledger" USING btree ("business_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "relationship_usage_period_metric_idx" ON "relationship_usage_ledger" USING btree ("business_id","period_start","metric");
--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_alert_business_fingerprint_unique" ON "relationship_operational_alerts" USING btree ("business_id","fingerprint");
--> statement-breakpoint
CREATE INDEX "relationship_alert_business_status_idx" ON "relationship_operational_alerts" USING btree ("business_id","status","severity");
--> statement-breakpoint
CREATE INDEX "relationship_room_binding_relationship_idx" ON "relationship_room_bindings" USING btree ("business_id","relationship_id","created_at");
