CREATE TABLE "broadcast_studio_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_user_id" integer NOT NULL,
	"revision" integer NOT NULL,
	"name" text NOT NULL,
	"config" json NOT NULL,
	"reason" text DEFAULT 'save' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_studio_versions_revision_check" CHECK ("revision" > 0),
	CONSTRAINT "broadcast_studio_versions_reason_check" CHECK ("reason" IN ('save', 'restore'))
);
--> statement-breakpoint
ALTER TABLE "broadcast_studio_versions" ADD CONSTRAINT "broadcast_studio_versions_studio_id_broadcast_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."broadcast_studios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_studio_versions" ADD CONSTRAINT "broadcast_studio_versions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_studio_versions" ADD CONSTRAINT "broadcast_studio_versions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_studio_versions_studio_revision_unique" ON "broadcast_studio_versions" USING btree ("studio_id","revision");
--> statement-breakpoint
CREATE INDEX "broadcast_studio_versions_studio_created_idx" ON "broadcast_studio_versions" USING btree ("studio_id","created_at");
