CREATE TABLE "content_research_briefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic" text NOT NULL,
  "audience" text NOT NULL DEFAULT '',
  "objective" text NOT NULL DEFAULT '',
  "angle" text NOT NULL DEFAULT '',
  "working_title" text NOT NULL DEFAULT '',
  "draft_text" text NOT NULL DEFAULT '',
  "sources" json NOT NULL DEFAULT '[]',
  "competitors" json NOT NULL DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_research_briefs_owner_updated_idx" ON "content_research_briefs" USING btree ("owner_user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "content_research_briefs_business_updated_idx" ON "content_research_briefs" USING btree ("business_id", "updated_at");
