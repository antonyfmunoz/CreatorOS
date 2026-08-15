CREATE TABLE "broadcast_studio_collaborators" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "studio_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "invited_by_user_id" integer NOT NULL,
  "role" text DEFAULT 'viewer' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "broadcast_studio_collaborators_studio_user_unique" UNIQUE("studio_id", "user_id"),
  CONSTRAINT "broadcast_studio_collaborators_role_check" CHECK ("role" IN ('viewer', 'editor'))
);
--> statement-breakpoint
ALTER TABLE "broadcast_studio_collaborators" ADD CONSTRAINT "broadcast_studio_collaborators_studio_id_broadcast_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."broadcast_studios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_studio_collaborators" ADD CONSTRAINT "broadcast_studio_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_studio_collaborators" ADD CONSTRAINT "broadcast_studio_collaborators_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_studio_collaborators_user_created_idx" ON "broadcast_studio_collaborators" USING btree ("user_id", "created_at");
