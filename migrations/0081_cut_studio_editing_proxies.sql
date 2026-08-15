ALTER TABLE "cut_studio_jobs" DROP CONSTRAINT IF EXISTS "cut_studio_jobs_kind_check";
ALTER TABLE "cut_studio_jobs"
  ADD CONSTRAINT "cut_studio_jobs_kind_check"
  CHECK ("kind" IN ('transcribe', 'highlights', 'render', 'proxy'));
