CREATE TABLE IF NOT EXISTS "vision_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "source" text NOT NULL DEFAULT 'camera',
  "quality" text NOT NULL DEFAULT 'balanced',
  "settings" json NOT NULL DEFAULT '{}'::json,
  "version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vision_presets_business_label_active_unique"
  ON "vision_presets" ("business_id", "label") WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "vision_presets_owner_updated_idx"
  ON "vision_presets" ("owner_user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "vision_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "source" text NOT NULL DEFAULT 'camera',
  "quality" text NOT NULL DEFAULT 'balanced',
  "status" text NOT NULL DEFAULT 'ready',
  "active_preset_id" uuid REFERENCES "vision_presets"("id") ON DELETE SET NULL,
  "follow_target" text,
  "capture_notice_acknowledged_at" timestamp,
  "started_at" timestamp,
  "stopped_at" timestamp,
  "last_interaction_at" timestamp NOT NULL DEFAULT now(),
  "last_frame_at" timestamp,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vision_sessions_business_updated_idx"
  ON "vision_sessions" ("business_id", "updated_at");
CREATE INDEX IF NOT EXISTS "vision_sessions_owner_status_idx"
  ON "vision_sessions" ("owner_user_id", "status");

CREATE TABLE IF NOT EXISTS "vision_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "vision_sessions"("id") ON DELETE CASCADE,
  "frame_id" text NOT NULL,
  "kind" text NOT NULL,
  "label" text,
  "summary" text NOT NULL DEFAULT '',
  "confidence" double precision NOT NULL DEFAULT 1,
  "source" text NOT NULL,
  "operator_confirmed" boolean NOT NULL DEFAULT false,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "metrics" json NOT NULL DEFAULT '{}'::json,
  "captured_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "vision_observations_session_captured_idx"
  ON "vision_observations" ("session_id", "captured_at");
CREATE UNIQUE INDEX IF NOT EXISTS "vision_observations_session_frame_kind_unique"
  ON "vision_observations" ("session_id", "frame_id", "kind");

CREATE TABLE IF NOT EXISTS "vision_watches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "vision_sessions"("id") ON DELETE CASCADE,
  "target" text NOT NULL,
  "condition" text NOT NULL DEFAULT 'moved',
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamp NOT NULL,
  "stopped_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vision_watches_session_status_idx"
  ON "vision_watches" ("session_id", "status", "expires_at");

CREATE TABLE IF NOT EXISTS "vision_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "vision_sessions"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "version" integer,
  "payload" json NOT NULL DEFAULT '{}'::json,
  "evidence" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vision_events_session_created_idx"
  ON "vision_events" ("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "vision_events_business_created_idx"
  ON "vision_events" ("business_id", "created_at");
