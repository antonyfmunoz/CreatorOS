ALTER TABLE "automation_runs" ADD COLUMN "thread_id" uuid;
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_thread_id_automation_threads_id_fk"
  FOREIGN KEY ("thread_id") REFERENCES "public"."automation_threads"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "automation_runs_thread_created_idx" ON "automation_runs" ("thread_id", "created_at");
--> statement-breakpoint
UPDATE "automation_runs" r
SET "thread_id" = t."id"
FROM "automation_threads" t
WHERE t."run_id" = r."id" AND r."thread_id" IS NULL;
