ALTER TABLE "cut_studio_jobs" DROP CONSTRAINT IF EXISTS "cut_studio_jobs_state_check";
ALTER TABLE "cut_studio_jobs" ADD CONSTRAINT "cut_studio_jobs_state_check"
  CHECK ("state" IN ('queued', 'running', 'done', 'error', 'cancelled'));
