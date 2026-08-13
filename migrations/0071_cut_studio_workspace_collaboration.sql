CREATE TABLE "cut_studio_collaborators" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "user_id" integer NOT NULL,
  "invited_by_user_id" integer NOT NULL,
  "role" text DEFAULT 'reviewer' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_collaborators_project_user_unique" UNIQUE("project_id", "user_id"),
  CONSTRAINT "cut_studio_collaborators_role_check" CHECK ("role" IN ('reviewer', 'editor'))
);
--> statement-breakpoint
CREATE TABLE "cut_studio_workspace_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "author_user_id" integer NOT NULL,
  "body" text NOT NULL,
  "position_ms" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  CONSTRAINT "cut_studio_workspace_notes_body_check" CHECK (char_length("body") BETWEEN 1 AND 2000),
  CONSTRAINT "cut_studio_workspace_notes_position_check" CHECK ("position_ms" BETWEEN 0 AND 43200000),
  CONSTRAINT "cut_studio_workspace_notes_status_check" CHECK ("status" IN ('open', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "cut_studio_collaborators" ADD CONSTRAINT "cut_studio_collaborators_project_id_cut_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cut_studio_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_collaborators" ADD CONSTRAINT "cut_studio_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_collaborators" ADD CONSTRAINT "cut_studio_collaborators_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_workspace_notes" ADD CONSTRAINT "cut_studio_workspace_notes_project_id_cut_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cut_studio_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_workspace_notes" ADD CONSTRAINT "cut_studio_workspace_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cut_studio_collaborators_user_created_idx" ON "cut_studio_collaborators" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "cut_studio_workspace_notes_project_position_idx" ON "cut_studio_workspace_notes" USING btree ("project_id", "position_ms");
