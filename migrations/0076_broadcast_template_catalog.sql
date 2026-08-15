CREATE TABLE "broadcast_template_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"owner_user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"payload" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_template_catalog_kind_check" CHECK ("kind" IN ('scene', 'source')),
	CONSTRAINT "broadcast_template_catalog_name_check" CHECK (char_length(trim("name")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "broadcast_template_catalog" ADD CONSTRAINT "broadcast_template_catalog_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_template_catalog" ADD CONSTRAINT "broadcast_template_catalog_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_template_catalog_business_kind_name_unique" ON "broadcast_template_catalog" USING btree ("business_id","kind","name");
--> statement-breakpoint
CREATE INDEX "broadcast_template_catalog_business_updated_idx" ON "broadcast_template_catalog" USING btree ("business_id","updated_at");
--> statement-breakpoint
CREATE INDEX "broadcast_template_catalog_owner_updated_idx" ON "broadcast_template_catalog" USING btree ("owner_user_id","updated_at");
