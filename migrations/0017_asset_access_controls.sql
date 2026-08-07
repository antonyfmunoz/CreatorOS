ALTER TABLE "assets" ADD COLUMN "storage_provider" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "original_filename" text;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "sha256" text;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "delete_after" timestamp;
--> statement-breakpoint
CREATE INDEX "assets_owner_created_at_idx" ON "assets" USING btree ("owner_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "assets_status_visibility_idx" ON "assets" USING btree ("status", "visibility");
