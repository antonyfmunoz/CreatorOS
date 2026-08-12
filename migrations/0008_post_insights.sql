ALTER TABLE "posts" ADD COLUMN "repost_of_id" integer;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_repost_of_id_posts_id_fk" FOREIGN KEY ("repost_of_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "post_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "viewed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "post_view_post_user_unique" UNIQUE("post_id", "user_id")
);
--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
