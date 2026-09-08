-- A sandboxed composition is rendered only by a paired local node. Keep its
-- durable job kind explicit in the database so an invalid/legacy worker cannot
-- claim it as an ordinary CutStudio render.
ALTER TABLE "cut_studio_jobs"
  DROP CONSTRAINT IF EXISTS "cut_studio_jobs_kind_check";

ALTER TABLE "cut_studio_jobs"
  ADD CONSTRAINT "cut_studio_jobs_kind_check"
  CHECK ("kind" IN ('transcribe', 'highlights', 'render', 'proxy', 'code_render'));
