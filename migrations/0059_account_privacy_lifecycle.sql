ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;
--> statement-breakpoint
CREATE TABLE "account_privacy_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" integer NOT NULL,
  "kind" text NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "scheduled_for" timestamp,
  "completed_at" timestamp,
  "canceled_at" timestamp,
  "failure_code" text,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_privacy_requests" ADD CONSTRAINT "account_privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "account_privacy_user_kind_created_idx" ON "account_privacy_requests" USING btree ("user_id","kind","created_at");
--> statement-breakpoint
CREATE INDEX "account_privacy_status_schedule_idx" ON "account_privacy_requests" USING btree ("status","scheduled_for");
