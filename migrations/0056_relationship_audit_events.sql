CREATE TABLE "relationship_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_user_id" integer,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"correlation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "relationship_audit_events" ADD CONSTRAINT "relationship_audit_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_audit_events" ADD CONSTRAINT "relationship_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relationship_audit_events_business_created_idx" ON "relationship_audit_events" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "relationship_audit_events_target_idx" ON "relationship_audit_events" USING btree ("business_id","target_type","target_id");