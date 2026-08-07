ALTER TABLE "projection_events" ADD COLUMN IF NOT EXISTS "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "projection_events" ADD COLUMN IF NOT EXISTS "trace_id" text;
--> statement-breakpoint
ALTER TABLE "umh_commands" ADD COLUMN IF NOT EXISTS "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "umh_command_outcomes" ADD COLUMN IF NOT EXISTS "correlation_id" text;
--> statement-breakpoint
ALTER TABLE "umh_audit_records" ADD COLUMN IF NOT EXISTS "correlation_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projection_events_correlation_id_idx" ON "projection_events" USING btree ("correlation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "umh_commands_correlation_id_idx" ON "umh_commands" USING btree ("correlation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "umh_command_outcomes_correlation_id_idx" ON "umh_command_outcomes" USING btree ("correlation_id");
