CREATE TABLE "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL,
  "owner_user_id" integer NOT NULL,
  "name" text NOT NULL,
  "objective" text DEFAULT 'awareness' NOT NULL,
  "channel" text DEFAULT 'organic' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "budget_cents" integer DEFAULT 0 NOT NULL,
  "targeting" json DEFAULT '{}'::json NOT NULL,
  "starts_at" timestamp,
  "ends_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_deliverables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "content_draft_id" uuid,
  "distribution_job_id" uuid,
  "title" text NOT NULL,
  "channel" text DEFAULT 'CreativesOS' NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "due_at" timestamp,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "captured_at" timestamp DEFAULT now() NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "engagements" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "conversions" integer DEFAULT 0 NOT NULL,
  "spend_cents" integer DEFAULT 0 NOT NULL,
  "attributed_revenue_cents" integer DEFAULT 0 NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_deliverables" ADD CONSTRAINT "campaign_deliverables_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_deliverables" ADD CONSTRAINT "campaign_deliverables_content_draft_id_content_drafts_id_fk" FOREIGN KEY ("content_draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_deliverables" ADD CONSTRAINT "campaign_deliverables_distribution_job_id_distribution_jobs_id_fk" FOREIGN KEY ("distribution_job_id") REFERENCES "public"."distribution_jobs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_metrics" ADD CONSTRAINT "campaign_metrics_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "campaigns_business_created_idx" ON "campaigns" USING btree ("business_id", "created_at");
--> statement-breakpoint
CREATE INDEX "campaign_deliverables_campaign_due_idx" ON "campaign_deliverables" USING btree ("campaign_id", "due_at");
--> statement-breakpoint
CREATE INDEX "campaign_metrics_campaign_captured_idx" ON "campaign_metrics" USING btree ("campaign_id", "captured_at");
