ALTER TABLE "distribution_jobs"
  ADD COLUMN IF NOT EXISTS "asset_ids" json DEFAULT '[]'::json NOT NULL;
