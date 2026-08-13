CREATE TABLE "cut_studio_project_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "owner_user_id" integer NOT NULL,
  "name" text NOT NULL,
  "media_kind" text NOT NULL,
  "duration" double precision NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cut_studio_project_media_kind_check" CHECK ("media_kind" IN ('video', 'audio')),
  CONSTRAINT "cut_studio_project_media_duration_check" CHECK ("duration" > 0 AND "duration" <= 43200),
  CONSTRAINT "cut_studio_project_media_project_asset_unique" UNIQUE("project_id", "asset_id")
);
--> statement-breakpoint
ALTER TABLE "cut_studio_project_media" ADD CONSTRAINT "cut_studio_project_media_project_id_cut_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cut_studio_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_project_media" ADD CONSTRAINT "cut_studio_project_media_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cut_studio_project_media" ADD CONSTRAINT "cut_studio_project_media_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cut_studio_project_media_project_created_idx" ON "cut_studio_project_media" USING btree ("project_id", "created_at");
--> statement-breakpoint
INSERT INTO "cut_studio_project_media" ("project_id", "asset_id", "owner_user_id", "name", "media_kind", "duration")
SELECT "id", "source_asset_id", "owner_user_id", "name", "media_kind", "duration"
FROM "cut_studio_projects"
ON CONFLICT ("project_id", "asset_id") DO NOTHING;
