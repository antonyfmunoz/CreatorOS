ALTER TABLE "cut_studio_jobs"
  ADD COLUMN "attempt" integer NOT NULL DEFAULT 0,
  ADD COLUMN "max_attempts" integer NOT NULL DEFAULT 3,
  ADD COLUMN "retry_of_job_id" uuid REFERENCES "cut_studio_jobs"("id") ON DELETE SET NULL;

-- Existing work has at least one attempt, without inventing historical counts.
UPDATE "cut_studio_jobs" SET "attempt" = 1
  WHERE "state" IN ('running', 'done', 'error') OR "started_at" IS NOT NULL;

ALTER TABLE "cut_studio_jobs" ADD CONSTRAINT "cut_studio_jobs_attempt_check"
  CHECK ("attempt" >= 0 AND "max_attempts" BETWEEN 1 AND 10 AND "attempt" <= "max_attempts");
CREATE UNIQUE INDEX "cut_studio_jobs_retry_of_idx" ON "cut_studio_jobs" ("retry_of_job_id");

-- Database-owned accounting also covers older worker images during rollout.
CREATE FUNCTION "cut_studio_count_claim"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'running' AND OLD.state = 'queued' THEN
    IF OLD.cancellation_requested_at IS NOT NULL OR OLD.attempt >= OLD.max_attempts THEN
      RAISE EXCEPTION 'CutStudio claim is cancelled or exhausted' USING ERRCODE = '23514';
    END IF;
    NEW.attempt := OLD.attempt + 1;
    NEW.max_attempts := OLD.max_attempts;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "cut_studio_count_claim_trigger" BEFORE UPDATE OF "state" ON "cut_studio_jobs"
  FOR EACH ROW EXECUTE FUNCTION "cut_studio_count_claim"();
