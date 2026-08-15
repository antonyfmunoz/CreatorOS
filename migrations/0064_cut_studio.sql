CREATE TABLE "cut_studio_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL,
  "business_id" uuid NOT NULL,
  "source_asset_id" uuid NOT NULL,
  "name" text NOT NULL,
  "duration" double precision NOT NULL,
  "media_kind" text NOT NULL,
  "edl" json NOT NULL,
  "transcript" json,
  "revision" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_projects_duration_check" CHECK ("duration" > 0 AND "duration" <= 43200),
  CONSTRAINT "cut_studio_projects_media_kind_check" CHECK ("media_kind" IN ('video', 'audio')),
  CONSTRAINT "cut_studio_projects_status_check" CHECK ("status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "cut_studio_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "owner_user_id" integer NOT NULL,
  "kind" text NOT NULL,
  "state" text DEFAULT 'queued' NOT NULL,
  "detail" text DEFAULT 'Queued' NOT NULL,
  "progress" double precision DEFAULT 0 NOT NULL,
  "request" json DEFAULT '{}'::json NOT NULL,
  "output" json DEFAULT '{}'::json NOT NULL,
  "artifact_asset_id" uuid,
  "error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  CONSTRAINT "cut_studio_jobs_kind_check" CHECK ("kind" IN ('transcribe', 'highlights', 'render')),
  CONSTRAINT "cut_studio_jobs_state_check" CHECK ("state" IN ('queued', 'running', 'done', 'error')),
  CONSTRAINT "cut_studio_jobs_progress_check" CHECK ("progress" >= 0 AND "progress" <= 1)
);
--> statement-breakpoint
ALTER TABLE "cut_studio_projects" ADD CONSTRAINT "cut_studio_projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_projects" ADD CONSTRAINT "cut_studio_projects_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_projects" ADD CONSTRAINT "cut_studio_projects_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_jobs" ADD CONSTRAINT "cut_studio_jobs_project_id_cut_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cut_studio_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_jobs" ADD CONSTRAINT "cut_studio_jobs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_jobs" ADD CONSTRAINT "cut_studio_jobs_artifact_asset_id_assets_id_fk" FOREIGN KEY ("artifact_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cut_studio_projects_owner_updated_idx" ON "cut_studio_projects" USING btree ("owner_user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "cut_studio_projects_business_updated_idx" ON "cut_studio_projects" USING btree ("business_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "cut_studio_jobs_project_created_idx" ON "cut_studio_jobs" USING btree ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX "cut_studio_jobs_state_created_idx" ON "cut_studio_jobs" USING btree ("state", "created_at");
