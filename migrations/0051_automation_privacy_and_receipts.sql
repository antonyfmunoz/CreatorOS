ALTER TABLE "automation_runs" ADD COLUMN "payload_redacted_at" timestamp;
--> statement-breakpoint
CREATE TABLE "automation_action_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "step_run_id" uuid NOT NULL UNIQUE REFERENCES "automation_step_runs"("id") ON DELETE CASCADE,
  "action_type" text NOT NULL,
  "output" json DEFAULT '{}'::json NOT NULL,
  "summary" text NOT NULL,
  "cost_units" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "automation_action_receipts_cost_check" CHECK ("cost_units" >= 0)
);
--> statement-breakpoint
-- Preserve append-only evidence while allowing the privacy service to redact
-- identity and free-form metadata under an explicit transaction-local flag.
CREATE OR REPLACE FUNCTION reject_automation_audit_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND current_setting('creativesos.audit_redaction', true) = 'on'
    AND NEW.id = OLD.id
    AND NEW.event_type = OLD.event_type
    AND NEW.created_at = OLD.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'automation audit events are append-only';
END;
$$ LANGUAGE plpgsql;
