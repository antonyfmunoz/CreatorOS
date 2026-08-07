ALTER TABLE "notifications" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_unique" UNIQUE("user_id","type","source_type","source_id");
