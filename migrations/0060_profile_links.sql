ALTER TABLE "users" ADD COLUMN "profile_links" json DEFAULT '[]'::json NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "push_notifications_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "color_mode" text DEFAULT 'dark' NOT NULL;
