CREATE TABLE "automation_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "trigger_type" text DEFAULT 'manual' NOT NULL,
  "trigger_config" json DEFAULT '{}'::json NOT NULL,
  "max_runs_per_hour" integer DEFAULT 20 NOT NULL,
  "max_steps_per_run" integer DEFAULT 20 NOT NULL,
  "retention_days" integer DEFAULT 90 NOT NULL,
  "last_activated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_definitions_status_check" CHECK ("status" IN ('draft','active','paused','archived')),
  CONSTRAINT "automation_definitions_trigger_check" CHECK ("trigger_type" IN ('manual','event','schedule','message')),
  CONSTRAINT "automation_definitions_limits_check" CHECK ("max_runs_per_hour" BETWEEN 1 AND 1000 AND "max_steps_per_run" BETWEEN 1 AND 100 AND "retention_days" BETWEEN 1 AND 3650)
);
--> statement-breakpoint
CREATE INDEX "automation_definitions_owner_status_idx" ON "automation_definitions" ("owner_user_id","status","updated_at");
CREATE INDEX "automation_definitions_business_status_idx" ON "automation_definitions" ("business_id","status");
--> statement-breakpoint
CREATE TABLE "automation_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "definition_id" uuid NOT NULL REFERENCES "automation_definitions"("id") ON DELETE CASCADE,
  "step_key" text NOT NULL,
  "name" text NOT NULL,
  "action_type" text NOT NULL,
  "config" json DEFAULT '{}'::json NOT NULL,
  "position" integer NOT NULL,
  "approval_policy" text DEFAULT 'none' NOT NULL,
  "retry_limit" integer DEFAULT 2 NOT NULL,
  "timeout_ms" integer DEFAULT 30000 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_steps_definition_key_unique" UNIQUE("definition_id","step_key"),
  CONSTRAINT "automation_steps_definition_position_unique" UNIQUE("definition_id","position"),
  CONSTRAINT "automation_steps_approval_check" CHECK ("approval_policy" IN ('none','always','consequential')),
  CONSTRAINT "automation_steps_limits_check" CHECK ("retry_limit" BETWEEN 0 AND 10 AND "timeout_ms" BETWEEN 1000 AND 300000 AND "position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "automation_trigger_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "payload" json DEFAULT '{}'::json NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "status" text DEFAULT 'pending' NOT NULL,
  "received_at" timestamp DEFAULT now() NOT NULL,
  "processed_at" timestamp,
  "error_message" text,
  CONSTRAINT "automation_trigger_events_status_check" CHECK ("status" IN ('pending','processed','failed','ignored'))
);
CREATE INDEX "automation_trigger_events_status_received_idx" ON "automation_trigger_events" ("status","received_at");
--> statement-breakpoint
CREATE TABLE "automation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "definition_id" uuid NOT NULL REFERENCES "automation_definitions"("id") ON DELETE RESTRICT,
  "definition_version" integer NOT NULL,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE SET NULL,
  "initiated_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "trigger_type" text NOT NULL,
  "trigger_event_id" uuid REFERENCES "automation_trigger_events"("id") ON DELETE SET NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "status" text DEFAULT 'queued' NOT NULL,
  "input" json DEFAULT '{}'::json NOT NULL,
  "output" json DEFAULT '{}'::json NOT NULL,
  "current_step_key" text,
  "step_count" integer DEFAULT 0 NOT NULL,
  "cost_units" integer DEFAULT 0 NOT NULL,
  "max_cost_units" integer DEFAULT 100 NOT NULL,
  "queued_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "heartbeat_at" timestamp,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_runs_status_check" CHECK ("status" IN ('queued','running','waiting_approval','succeeded','failed','canceled','dead_letter')),
  CONSTRAINT "automation_runs_budget_check" CHECK ("step_count" >= 0 AND "cost_units" >= 0 AND "max_cost_units" BETWEEN 1 AND 100000)
);
CREATE INDEX "automation_runs_status_attempt_idx" ON "automation_runs" ("status","next_attempt_at");
CREATE INDEX "automation_runs_definition_created_idx" ON "automation_runs" ("definition_id","created_at");
--> statement-breakpoint
CREATE TABLE "automation_step_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "automation_runs"("id") ON DELETE CASCADE,
  "step_id" uuid REFERENCES "automation_steps"("id") ON DELETE SET NULL,
  "step_key" text NOT NULL,
  "action_type" text NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "input" json DEFAULT '{}'::json NOT NULL,
  "output" json DEFAULT '{}'::json NOT NULL,
  "cost_units" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp,
  "heartbeat_at" timestamp,
  "next_attempt_at" timestamp,
  "finished_at" timestamp,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_step_runs_status_check" CHECK ("status" IN ('queued','running','waiting_approval','succeeded','failed','canceled')),
  CONSTRAINT "automation_step_runs_attempt_check" CHECK ("attempt" BETWEEN 1 AND 20 AND "cost_units" >= 0)
);
CREATE INDEX "automation_step_runs_run_step_attempt_idx" ON "automation_step_runs" ("run_id","step_key","attempt");
--> statement-breakpoint
CREATE TABLE "automation_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "automation_runs"("id") ON DELETE CASCADE,
  "step_run_id" uuid NOT NULL UNIQUE REFERENCES "automation_step_runs"("id") ON DELETE CASCADE,
  "requested_for_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL,
  "reason" text NOT NULL,
  "evidence" json DEFAULT '{}'::json NOT NULL,
  "expires_at" timestamp,
  "decided_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_approvals_status_check" CHECK ("status" IN ('pending','approved','declined','expired'))
);
CREATE INDEX "automation_approvals_user_status_idx" ON "automation_approvals" ("requested_for_user_id","status","created_at");
--> statement-breakpoint
CREATE TABLE "automation_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
  "definition_id" uuid REFERENCES "automation_definitions"("id") ON DELETE SET NULL,
  "run_id" uuid REFERENCES "automation_runs"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_threads_status_check" CHECK ("status" IN ('open','closed','archived'))
);
CREATE INDEX "automation_threads_owner_updated_idx" ON "automation_threads" ("owner_user_id","updated_at");
--> statement-breakpoint
CREATE TABLE "automation_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "automation_threads"("id") ON DELETE CASCADE,
  "author_type" text NOT NULL,
  "author_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "kind" text DEFAULT 'message' NOT NULL,
  "content" text NOT NULL,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_messages_author_check" CHECK ("author_type" IN ('user','automation','system')),
  CONSTRAINT "automation_messages_kind_check" CHECK ("kind" IN ('message','action','approval','status','error'))
);
CREATE INDEX "automation_messages_thread_created_idx" ON "automation_messages" ("thread_id","created_at");
--> statement-breakpoint
CREATE TABLE "automation_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE SET NULL,
  "definition_id" uuid REFERENCES "automation_definitions"("id") ON DELETE SET NULL,
  "run_id" uuid REFERENCES "automation_runs"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "metadata" json DEFAULT '{}'::json NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "automation_audit_events_run_created_idx" ON "automation_audit_events" ("run_id","created_at");
CREATE INDEX "automation_audit_events_actor_created_idx" ON "automation_audit_events" ("actor_user_id","created_at");
--> statement-breakpoint
-- Audit evidence is append-only at the database boundary.
CREATE OR REPLACE FUNCTION reject_automation_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'automation audit events are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER automation_audit_events_no_update
  BEFORE UPDATE OR DELETE ON "automation_audit_events"
  FOR EACH ROW EXECUTE FUNCTION reject_automation_audit_mutation();
