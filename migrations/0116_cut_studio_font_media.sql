ALTER TABLE "cut_studio_project_media"
  DROP CONSTRAINT IF EXISTS "cut_studio_project_media_kind_check";

ALTER TABLE "cut_studio_project_media"
  ADD CONSTRAINT "cut_studio_project_media_kind_check"
  CHECK ("media_kind" IN ('video', 'audio', 'image', 'font'));
