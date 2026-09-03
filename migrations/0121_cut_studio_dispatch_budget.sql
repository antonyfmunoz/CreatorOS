ALTER TABLE "cut_studio_jobs"
  ADD COLUMN "dispatch_attempt" integer NOT NULL DEFAULT 0,
  ADD COLUMN "max_dispatch_attempts" integer NOT NULL DEFAULT 3,
  ADD COLUMN "dispatch_token" uuid,
  ADD COLUMN "dispatch_expires_at" timestamp;

-- Preserve an outstanding legacy dispatch window; do not invent older counts.
UPDATE "cut_studio_jobs" SET "dispatch_attempt" = 1,
  "dispatch_expires_at" = "heartbeat_at" + interval '30 minutes'
  WHERE "state" = 'queued' AND "heartbeat_at" IS NOT NULL;

ALTER TABLE "cut_studio_jobs" ADD CONSTRAINT "cut_studio_jobs_dispatch_attempt_check"
  CHECK ("dispatch_attempt" >= 0 AND "max_dispatch_attempts" BETWEEN 1 AND 10
    AND "dispatch_attempt" <= "max_dispatch_attempts");
