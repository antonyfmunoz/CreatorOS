CREATE TABLE "cut_studio_audio_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"owner_user_id" integer NOT NULL,
	"name" text NOT NULL,
	"payload" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cut_studio_audio_templates_name_check" CHECK (char_length(trim("name")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "cut_studio_audio_templates" ADD CONSTRAINT "cut_studio_audio_templates_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_audio_templates" ADD CONSTRAINT "cut_studio_audio_templates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cut_studio_audio_templates_business_name_unique" ON "cut_studio_audio_templates" USING btree ("business_id","name");
--> statement-breakpoint
CREATE INDEX "cut_studio_audio_templates_business_updated_idx" ON "cut_studio_audio_templates" USING btree ("business_id","updated_at");
--> statement-breakpoint
CREATE INDEX "cut_studio_audio_templates_owner_updated_idx" ON "cut_studio_audio_templates" USING btree ("owner_user_id","updated_at");
