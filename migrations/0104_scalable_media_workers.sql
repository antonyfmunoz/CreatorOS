ALTER TABLE "media_processing_jobs"
  ADD COLUMN "worker_id" text,
  ADD COLUMN "worker_region" text,
  ADD COLUMN "lease_token" uuid,
  ADD COLUMN "lease_expires_at" timestamp,
  ADD COLUMN "heartbeat_at" timestamp,
  ADD COLUMN "cancellation_requested_at" timestamp;

CREATE INDEX "media_processing_jobs_lease_idx"
  ON "media_processing_jobs" ("state", "lease_expires_at");

CREATE INDEX "media_processing_jobs_worker_idx"
  ON "media_processing_jobs" ("worker_id", "state");

ALTER TABLE "cut_studio_jobs"
  ADD COLUMN "worker_id" text,
  ADD COLUMN "worker_region" text,
  ADD COLUMN "lease_token" uuid,
  ADD COLUMN "lease_expires_at" timestamp,
  ADD COLUMN "heartbeat_at" timestamp,
  ADD COLUMN "cancellation_requested_at" timestamp;

CREATE INDEX "cut_studio_jobs_lease_idx"
  ON "cut_studio_jobs" ("state", "lease_expires_at");

CREATE INDEX "cut_studio_jobs_worker_idx"
  ON "cut_studio_jobs" ("worker_id", "state");

CREATE TABLE "media_worker_nodes" (
  "id" text PRIMARY KEY NOT NULL,
  "region" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "capabilities" json NOT NULL DEFAULT '[]'::json,
  "max_concurrency" integer NOT NULL DEFAULT 1,
  "active_jobs" integer NOT NULL DEFAULT 0,
  "version" text,
  "heartbeat_at" timestamp NOT NULL DEFAULT now(),
  "drain_started_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "media_worker_nodes_status_check" CHECK ("status" IN ('active', 'draining', 'offline')),
  CONSTRAINT "media_worker_nodes_concurrency_check" CHECK ("max_concurrency" BETWEEN 1 AND 64),
  CONSTRAINT "media_worker_nodes_active_jobs_check" CHECK ("active_jobs" BETWEEN 0 AND "max_concurrency")
);

CREATE INDEX "media_worker_nodes_region_status_heartbeat_idx"
  ON "media_worker_nodes" ("region", "status", "heartbeat_at");

CREATE INDEX "media_worker_nodes_heartbeat_idx"
  ON "media_worker_nodes" ("heartbeat_at");
