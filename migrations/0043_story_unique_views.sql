CREATE TABLE IF NOT EXISTS "story_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "story_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "viewed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "story_view_story_user_unique" UNIQUE("story_id", "user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_views" ADD CONSTRAINT "story_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
