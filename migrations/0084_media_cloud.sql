CREATE TABLE "media_processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "state" text NOT NULL DEFAULT 'queued',
  "priority" integer NOT NULL DEFAULT 50,
  "progress" double precision NOT NULL DEFAULT 0,
  "attempt" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "idempotency_key" text NOT NULL UNIQUE,
  "request" json NOT NULL DEFAULT '{}'::json,
  "output" json NOT NULL DEFAULT '{}'::json,
  "error_code" text,
  "error_message" text,
  "available_at" timestamp NOT NULL DEFAULT now(),
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "media_processing_jobs_kind_check" CHECK ("kind" IN ('probe','thumbnail','transcode','package','caption','waveform','moderation')),
  CONSTRAINT "media_processing_jobs_state_check" CHECK ("state" IN ('queued','running','succeeded','failed','cancelled')),
  CONSTRAINT "media_processing_jobs_progress_check" CHECK ("progress" BETWEEN 0 AND 1),
  CONSTRAINT "media_processing_jobs_attempt_check" CHECK ("attempt" >= 0 AND "max_attempts" BETWEEN 1 AND 20),
  CONSTRAINT "media_processing_jobs_priority_check" CHECK ("priority" BETWEEN 0 AND 100)
);
CREATE INDEX "media_processing_jobs_dispatch_idx" ON "media_processing_jobs" ("state", "priority", "available_at");
CREATE INDEX "media_processing_jobs_asset_created_idx" ON "media_processing_jobs" ("asset_id", "created_at");
CREATE INDEX "media_processing_jobs_owner_created_idx" ON "media_processing_jobs" ("owner_user_id", "created_at");

CREATE TABLE "media_renditions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "rendition_key" text NOT NULL,
  "role" text NOT NULL,
  "storage_provider" text NOT NULL,
  "storage_key" text NOT NULL,
  "public_url" text,
  "mime_type" text NOT NULL,
  "width" integer,
  "height" integer,
  "bitrate_kbps" integer,
  "duration_ms" integer,
  "size_bytes" bigint,
  "manifest_type" text,
  "status" text NOT NULL DEFAULT 'ready',
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "media_renditions_asset_key_unique" UNIQUE ("asset_id", "rendition_key"),
  CONSTRAINT "media_renditions_role_check" CHECK ("role" IN ('poster','thumbnail','preview','audio','video','adaptive_manifest','download')),
  CONSTRAINT "media_renditions_manifest_check" CHECK ("manifest_type" IS NULL OR "manifest_type" IN ('hls','dash')),
  CONSTRAINT "media_renditions_status_check" CHECK ("status" IN ('pending','ready','failed','deleted')),
  CONSTRAINT "media_renditions_dimensions_check" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)),
  CONSTRAINT "media_renditions_values_check" CHECK (("bitrate_kbps" IS NULL OR "bitrate_kbps" > 0) AND ("duration_ms" IS NULL OR "duration_ms" >= 0) AND ("size_bytes" IS NULL OR "size_bytes" >= 0))
);
CREATE INDEX "media_renditions_asset_role_idx" ON "media_renditions" ("asset_id", "role", "status");

CREATE TABLE "media_text_tracks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "language" text NOT NULL DEFAULT 'en',
  "label" text NOT NULL,
  "storage_provider" text NOT NULL,
  "storage_key" text NOT NULL,
  "public_url" text,
  "mime_type" text NOT NULL DEFAULT 'text/vtt',
  "is_default" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'ready',
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "media_text_tracks_asset_kind_language_unique" UNIQUE ("asset_id", "kind", "language"),
  CONSTRAINT "media_text_tracks_kind_check" CHECK ("kind" IN ('captions','subtitles','chapters','transcript')),
  CONSTRAINT "media_text_tracks_status_check" CHECK ("status" IN ('pending','ready','failed','deleted')),
  CONSTRAINT "media_text_tracks_language_check" CHECK ("language" ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);
CREATE INDEX "media_text_tracks_asset_default_idx" ON "media_text_tracks" ("asset_id", "is_default");

CREATE TABLE "asset_lineage_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parent_asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "child_asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "relationship" text NOT NULL,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asset_lineage_edges_edge_unique" UNIQUE ("parent_asset_id", "child_asset_id", "relationship"),
  CONSTRAINT "asset_lineage_edges_not_self_check" CHECK ("parent_asset_id" <> "child_asset_id"),
  CONSTRAINT "asset_lineage_edges_relationship_check" CHECK ("relationship" IN ('derived_from','rendered_from','clipped_from','recorded_from','published_from','replaced_by'))
);
CREATE INDEX "asset_lineage_edges_child_idx" ON "asset_lineage_edges" ("child_asset_id", "created_at");
CREATE INDEX "asset_lineage_edges_parent_idx" ON "asset_lineage_edges" ("parent_asset_id", "created_at");

CREATE TABLE "asset_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "color" text NOT NULL DEFAULT '#1d9bf0',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asset_collections_owner_name_unique" UNIQUE ("owner_user_id", "name"),
  CONSTRAINT "asset_collections_color_check" CHECK ("color" ~ '^#[0-9a-fA-F]{6}$')
);
CREATE INDEX "asset_collections_owner_updated_idx" ON "asset_collections" ("owner_user_id", "updated_at");

CREATE TABLE "asset_collection_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" uuid NOT NULL REFERENCES "asset_collections"("id") ON DELETE cascade,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "added_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asset_collection_items_collection_asset_unique" UNIQUE ("collection_id", "asset_id")
);
CREATE INDEX "asset_collection_items_asset_idx" ON "asset_collection_items" ("asset_id", "created_at");

CREATE TABLE "media_playback_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "rendition_id" uuid REFERENCES "media_renditions"("id") ON DELETE set null,
  "viewer_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "client_session_id" text NOT NULL,
  "player_version" text NOT NULL DEFAULT 'web',
  "state" text NOT NULL DEFAULT 'active',
  "watch_ms" integer NOT NULL DEFAULT 0,
  "last_position_ms" integer NOT NULL DEFAULT 0,
  "last_event_kind" text,
  "last_event_at" timestamp,
  "rebuffer_count" integer NOT NULL DEFAULT 0,
  "rebuffer_ms" integer NOT NULL DEFAULT 0,
  "quality_change_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "media_playback_sessions_viewer_client_unique" UNIQUE ("viewer_user_id", "client_session_id"),
  CONSTRAINT "media_playback_sessions_state_check" CHECK ("state" IN ('active','ended','abandoned')),
  CONSTRAINT "media_playback_sessions_counts_check" CHECK ("watch_ms" >= 0 AND "last_position_ms" >= 0 AND "rebuffer_count" >= 0 AND "rebuffer_ms" >= 0 AND "quality_change_count" >= 0 AND "error_count" >= 0)
);
CREATE INDEX "media_playback_sessions_asset_started_idx" ON "media_playback_sessions" ("asset_id", "started_at");

CREATE TABLE "media_playback_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "media_playback_sessions"("id") ON DELETE cascade,
  "sequence" integer NOT NULL,
  "kind" text NOT NULL,
  "occurred_at" timestamp NOT NULL,
  "position_ms" integer NOT NULL DEFAULT 0,
  "buffered_ms" integer NOT NULL DEFAULT 0,
  "bitrate_kbps" integer,
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "media_playback_events_session_sequence_unique" UNIQUE ("session_id", "sequence"),
  CONSTRAINT "media_playback_events_kind_check" CHECK ("kind" IN ('play','pause','seek','progress','quality_change','rebuffer_start','rebuffer_end','ended','error')),
  CONSTRAINT "media_playback_events_values_check" CHECK ("sequence" > 0 AND "position_ms" >= 0 AND "buffered_ms" >= 0 AND ("bitrate_kbps" IS NULL OR "bitrate_kbps" >= 0))
);
CREATE INDEX "media_playback_events_session_occurred_idx" ON "media_playback_events" ("session_id", "occurred_at");

CREATE TABLE "asset_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tag" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asset_tags_asset_tag_unique" UNIQUE ("asset_id", "tag"),
  CONSTRAINT "asset_tags_normalized_check" CHECK ("tag" = lower("tag") AND "tag" ~ '^[a-z0-9][a-z0-9_-]{0,39}$')
);
CREATE INDEX "asset_tags_owner_tag_idx" ON "asset_tags" ("owner_user_id", "tag");

CREATE TABLE "asset_rights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "rights_holder_name" text NOT NULL,
  "basis" text NOT NULL DEFAULT 'owner_declaration',
  "permitted_uses" json NOT NULL DEFAULT '["all"]'::json,
  "territories" json NOT NULL DEFAULT '["worldwide"]'::json,
  "valid_from" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp,
  "status" text NOT NULL DEFAULT 'active',
  "evidence_asset_id" uuid REFERENCES "assets"("id") ON DELETE set null,
  "synthetic_media" boolean NOT NULL DEFAULT false,
  "cloned_voice" boolean NOT NULL DEFAULT false,
  "notes" text NOT NULL DEFAULT '',
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asset_rights_basis_check" CHECK ("basis" IN ('owner_declaration','work_for_hire','assignment','license','public_domain','platform_grant','contributor_release')),
  CONSTRAINT "asset_rights_status_check" CHECK ("status" IN ('active','revoked','disputed','expired')),
  CONSTRAINT "asset_rights_dates_check" CHECK ("expires_at" IS NULL OR "expires_at" > "valid_from"),
  CONSTRAINT "asset_rights_arrays_check" CHECK (jsonb_typeof("permitted_uses"::jsonb) = 'array' AND jsonb_array_length("permitted_uses"::jsonb) > 0 AND jsonb_typeof("territories"::jsonb) = 'array' AND jsonb_array_length("territories"::jsonb) > 0)
);
CREATE INDEX "asset_rights_asset_status_idx" ON "asset_rights" ("asset_id", "status", "expires_at");
CREATE INDEX "asset_rights_owner_updated_idx" ON "asset_rights" ("owner_user_id", "updated_at");

CREATE TABLE "asset_usage_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "surface_type" text NOT NULL,
  "surface_id" text NOT NULL,
  "use_type" text NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "ended_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asset_usage_records_usage_unique" UNIQUE ("asset_id", "surface_type", "surface_id", "use_type"),
  CONSTRAINT "asset_usage_records_state_check" CHECK ("state" IN ('active','ended','blocked')),
  CONSTRAINT "asset_usage_records_surface_check" CHECK ("surface_type" IN ('post','story','product','course','cutstudio','broadcast','ugc','distribution','podcast','design','site','community','event')),
  CONSTRAINT "asset_usage_records_use_check" CHECK ("use_type" IN ('native_publish','commercial_delivery','editing','broadcast','ugc_submission','external_distribution','playback','artwork','evidence'))
);
CREATE INDEX "asset_usage_records_asset_started_idx" ON "asset_usage_records" ("asset_id", "started_at");
CREATE INDEX "asset_usage_records_surface_idx" ON "asset_usage_records" ("surface_type", "surface_id");

INSERT INTO "asset_rights" ("asset_id", "owner_user_id", "rights_holder_name", "basis", "permitted_uses", "territories", "status", "notes")
SELECT a."id", a."owner_user_id", coalesce(nullif(u."display_name", ''), u."username", 'Asset owner'), 'owner_declaration', '["all"]'::json, '["worldwide"]'::json, 'active', 'Backfilled owner declaration; verify supporting evidence before high-risk external use.'
FROM "assets" a JOIN "users" u ON u."id" = a."owner_user_id"
WHERE a."status" <> 'deleted';

CREATE FUNCTION creativesos_seed_asset_rights() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "asset_rights" ("asset_id", "owner_user_id", "rights_holder_name", "basis", "permitted_uses", "territories", "status", "notes")
  SELECT NEW."id", NEW."owner_user_id", coalesce(nullif(u."display_name", ''), u."username", 'Asset owner'), 'owner_declaration', '["all"]'::json, '["worldwide"]'::json, 'active', 'Created automatically from the uploader ownership declaration.'
  FROM "users" u WHERE u."id" = NEW."owner_user_id";
  RETURN NEW;
END;
$$;
CREATE TRIGGER creativesos_assets_seed_rights AFTER INSERT ON "assets" FOR EACH ROW EXECUTE FUNCTION creativesos_seed_asset_rights();

CREATE TABLE "analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade,
  "user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "anonymous_id" text,
  "session_id" text NOT NULL,
  "event_name" text NOT NULL,
  "schema_version" integer NOT NULL DEFAULT 1,
  "object_type" text,
  "object_id" text,
  "source" text NOT NULL DEFAULT 'web',
  "deduplication_key" text NOT NULL UNIQUE,
  "consent_state" text NOT NULL DEFAULT 'essential',
  "properties" json NOT NULL DEFAULT '{}'::json,
  "occurred_at" timestamp NOT NULL,
  "received_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_events_name_check" CHECK ("event_name" IN ('content.exposed','content.engaged','media.played','relationship.started','funnel.step','product.viewed','checkout.started','purchase.completed','entitlement.activated','refund.completed','revenue.allocated','experiment.exposed')),
  CONSTRAINT "analytics_events_values_check" CHECK ("schema_version" > 0 AND length("session_id") BETWEEN 8 AND 180 AND length("deduplication_key") BETWEEN 8 AND 200),
  CONSTRAINT "analytics_events_consent_check" CHECK ("consent_state" IN ('essential','analytics','denied'))
);
CREATE INDEX "analytics_events_business_occurred_idx" ON "analytics_events" ("business_id", "occurred_at");
CREATE INDEX "analytics_events_user_occurred_idx" ON "analytics_events" ("user_id", "occurred_at");
CREATE INDEX "analytics_events_object_occurred_idx" ON "analytics_events" ("object_type", "object_id", "occurred_at");

CREATE TABLE "analytics_identity_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade,
  "anonymous_id" text NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "source" text NOT NULL DEFAULT 'authenticated_session',
  "confidence" double precision NOT NULL DEFAULT 1,
  "first_seen_at" timestamp NOT NULL DEFAULT now(),
  "last_seen_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_identity_links_business_anonymous_user_unique" UNIQUE ("business_id", "anonymous_id", "user_id"),
  CONSTRAINT "analytics_identity_links_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);
CREATE INDEX "analytics_identity_links_user_idx" ON "analytics_identity_links" ("user_id", "last_seen_at");

CREATE TABLE "attribution_touches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade,
  "user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "anonymous_id" text,
  "asset_id" uuid REFERENCES "assets"("id") ON DELETE set null,
  "post_id" integer REFERENCES "posts"("id") ON DELETE set null,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE set null,
  "distribution_job_id" uuid REFERENCES "distribution_jobs"("id") ON DELETE set null,
  "source" text NOT NULL,
  "medium" text NOT NULL,
  "campaign_name" text,
  "touch_type" text NOT NULL DEFAULT 'view',
  "confidence" double precision NOT NULL DEFAULT 1,
  "deduplication_key" text NOT NULL UNIQUE,
  "occurred_at" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "attribution_touches_type_check" CHECK ("touch_type" IN ('view','engagement','conversation','click','checkout')),
  CONSTRAINT "attribution_touches_values_check" CHECK ("confidence" >= 0 AND "confidence" <= 1 AND "expires_at" > "occurred_at")
);
CREATE INDEX "attribution_touches_user_occurred_idx" ON "attribution_touches" ("user_id", "occurred_at");
CREATE INDEX "attribution_touches_business_occurred_idx" ON "attribution_touches" ("business_id", "occurred_at");

CREATE TABLE "conversion_attributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE cascade,
  "touch_id" uuid NOT NULL REFERENCES "attribution_touches"("id") ON DELETE restrict,
  "model" text NOT NULL DEFAULT 'last_touch_30d',
  "credit" double precision NOT NULL DEFAULT 1,
  "attributed_revenue_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "conversion_attributions_order_touch_model_unique" UNIQUE ("order_id", "touch_id", "model"),
  CONSTRAINT "conversion_attributions_values_check" CHECK ("credit" > 0 AND "credit" <= 1 AND "attributed_revenue_cents" >= 0)
);
CREATE INDEX "conversion_attributions_touch_idx" ON "conversion_attributions" ("touch_id", "created_at");

CREATE TABLE "analytics_experiments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "variants" json NOT NULL,
  "guardrails" json NOT NULL DEFAULT '[]'::json,
  "starts_at" timestamp,
  "ends_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_experiments_business_key_unique" UNIQUE ("business_id", "key"),
  CONSTRAINT "analytics_experiments_status_check" CHECK ("status" IN ('draft','running','paused','completed','rolled_back')),
  CONSTRAINT "analytics_experiments_variants_check" CHECK (jsonb_typeof("variants"::jsonb) = 'array' AND jsonb_array_length("variants"::jsonb) BETWEEN 2 AND 10)
);

CREATE TABLE "analytics_experiment_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "experiment_id" uuid NOT NULL REFERENCES "analytics_experiments"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "variant" text NOT NULL,
  "assigned_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_experiment_assignments_experiment_user_unique" UNIQUE ("experiment_id", "user_id")
);

CREATE TABLE "creative_work_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "assignee_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT 'content',
  "status" text NOT NULL DEFAULT 'idea',
  "priority" integer NOT NULL DEFAULT 50,
  "channel" text,
  "starts_at" timestamp,
  "due_at" timestamp,
  "completed_at" timestamp,
  "recurrence" json NOT NULL DEFAULT '{}'::json,
  "source_type" text,
  "source_id" text,
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "creative_work_items_kind_check" CHECK ("kind" IN ('content','campaign','broadcast','cut','ugc','distribution','event','podcast','design','newsletter','site')),
  CONSTRAINT "creative_work_items_status_check" CHECK ("status" IN ('idea','brief','script','production','edit','review','scheduled','published','retrospective','blocked','cancelled')),
  CONSTRAINT "creative_work_items_priority_check" CHECK ("priority" BETWEEN 0 AND 100),
  CONSTRAINT "creative_work_items_dates_check" CHECK ("starts_at" IS NULL OR "due_at" IS NULL OR "due_at" >= "starts_at")
);
CREATE INDEX "creative_work_items_business_due_idx" ON "creative_work_items" ("business_id", "due_at", "status");
CREATE INDEX "creative_work_items_assignee_due_idx" ON "creative_work_items" ("assignee_user_id", "due_at");
CREATE UNIQUE INDEX "creative_work_items_source_unique" ON "creative_work_items" ("business_id", "source_type", "source_id") WHERE "source_id" IS NOT NULL;

CREATE TABLE "creative_work_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "work_item_id" uuid NOT NULL REFERENCES "creative_work_items"("id") ON DELETE cascade,
  "depends_on_work_item_id" uuid NOT NULL REFERENCES "creative_work_items"("id") ON DELETE cascade,
  "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "creative_work_dependencies_unique" UNIQUE ("work_item_id", "depends_on_work_item_id"),
  CONSTRAINT "creative_work_dependencies_not_self_check" CHECK ("work_item_id" <> "depends_on_work_item_id")
);

CREATE TABLE "creative_work_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "work_item_id" uuid NOT NULL REFERENCES "creative_work_items"("id") ON DELETE cascade,
  "requested_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "reviewer_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "status" text NOT NULL DEFAULT 'pending',
  "note" text NOT NULL DEFAULT '',
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "decided_at" timestamp,
  CONSTRAINT "creative_work_approvals_status_check" CHECK ("status" IN ('pending','approved','changes_requested','cancelled'))
);
CREATE UNIQUE INDEX "creative_work_approvals_item_pending_unique" ON "creative_work_approvals" ("work_item_id") WHERE "status" = 'pending';

CREATE TABLE "audience_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade, "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE cascade,
  "subscriber_status" text NOT NULL DEFAULT 'prospect', "lifecycle_state" text NOT NULL DEFAULT 'new', "acquisition_source" text NOT NULL DEFAULT 'manual', "interests" json NOT NULL DEFAULT '[]'::json, "engagement_score" double precision NOT NULL DEFAULT 0, "fields" json NOT NULL DEFAULT '{}'::json,
  "subscribed_at" timestamp, "unsubscribed_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "audience_profiles_relationship_unique" UNIQUE ("business_id", "relationship_id"), CONSTRAINT "audience_profiles_subscriber_status_check" CHECK ("subscriber_status" IN ('prospect','subscribed','unsubscribed','suppressed')), CONSTRAINT "audience_profiles_lifecycle_check" CHECK ("lifecycle_state" IN ('new','engaged','qualified','customer','advocate','dormant','churned')),
  CONSTRAINT "audience_profiles_score_check" CHECK ("engagement_score" BETWEEN 0 AND 100)
);
CREATE INDEX "audience_profiles_lifecycle_idx" ON "audience_profiles" ("business_id", "subscriber_status", "lifecycle_state");

CREATE TABLE "audience_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade, "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "name" text NOT NULL, "description" text NOT NULL DEFAULT '', "filter" json NOT NULL DEFAULT '{}'::json, "status" text NOT NULL DEFAULT 'active', "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "audience_segments_business_name_unique" UNIQUE ("business_id", "name"), CONSTRAINT "audience_segments_status_check" CHECK ("status" IN ('active','archived'))
);
CREATE TABLE "audience_segment_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "segment_id" uuid NOT NULL REFERENCES "audience_segments"("id") ON DELETE cascade, "relationship_id" uuid NOT NULL REFERENCES "relationships"("id") ON DELETE cascade, "source" text NOT NULL DEFAULT 'manual', "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "audience_segment_memberships_unique" UNIQUE ("segment_id", "relationship_id")
);

CREATE TABLE "notification_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade, "user_id" integer REFERENCES "users"("id") ON DELETE cascade, "relationship_id" uuid REFERENCES "relationships"("id") ON DELETE cascade, "channel" text NOT NULL, "purpose" text NOT NULL DEFAULT 'product', "enabled" boolean NOT NULL DEFAULT true, "quiet_hours_start" text, "quiet_hours_end" text, "timezone" text NOT NULL DEFAULT 'UTC', "digest_cadence" text NOT NULL DEFAULT 'immediate', "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_preferences_recipient_check" CHECK (("user_id" IS NOT NULL)::integer + ("relationship_id" IS NOT NULL)::integer = 1), CONSTRAINT "notification_preferences_channel_check" CHECK ("channel" IN ('in_app','email','push')), CONSTRAINT "notification_preferences_digest_check" CHECK ("digest_cadence" IN ('immediate','hourly','daily','weekly','off'))
);
CREATE UNIQUE INDEX "notification_preferences_user_unique" ON "notification_preferences" ("business_id", "user_id", "channel", "purpose") WHERE "user_id" IS NOT NULL;
CREATE UNIQUE INDEX "notification_preferences_relationship_unique" ON "notification_preferences" ("business_id", "relationship_id", "channel", "purpose") WHERE "relationship_id" IS NOT NULL;

CREATE TABLE "notification_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade, "recipient_user_id" integer REFERENCES "users"("id") ON DELETE cascade, "relationship_id" uuid REFERENCES "relationships"("id") ON DELETE cascade, "event_type" text NOT NULL, "title" text NOT NULL, "body" text NOT NULL, "link_to" text, "purpose" text NOT NULL DEFAULT 'product', "urgency" text NOT NULL DEFAULT 'normal', "data" json NOT NULL DEFAULT '{}'::json, "dedupe_key" text NOT NULL, "status" text NOT NULL DEFAULT 'accepted', "scheduled_at" timestamp NOT NULL DEFAULT now(), "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_events_business_dedupe_unique" UNIQUE ("business_id", "dedupe_key"), CONSTRAINT "notification_events_recipient_check" CHECK (("recipient_user_id" IS NOT NULL)::integer + ("relationship_id" IS NOT NULL)::integer = 1), CONSTRAINT "notification_events_status_check" CHECK ("status" IN ('accepted','suppressed','batched','completed','failed')), CONSTRAINT "notification_events_urgency_check" CHECK ("urgency" IN ('low','normal','high','critical'))
);
CREATE INDEX "notification_events_due_idx" ON "notification_events" ("status", "scheduled_at");

CREATE TABLE "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "event_id" uuid NOT NULL REFERENCES "notification_events"("id") ON DELETE cascade, "channel" text NOT NULL, "adapter" text NOT NULL, "status" text NOT NULL DEFAULT 'queued', "attempt_count" integer NOT NULL DEFAULT 0, "next_attempt_at" timestamp NOT NULL DEFAULT now(), "provider_receipt_id" text, "error_code" text, "error_message" text, "sent_at" timestamp, "delivered_at" timestamp, "opened_at" timestamp, "clicked_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_deliveries_event_channel_unique" UNIQUE ("event_id", "channel"), CONSTRAINT "notification_deliveries_status_check" CHECK ("status" IN ('queued','batched','provider_pending','sent','delivered','opened','clicked','suppressed','failed'))
);
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" ("status", "next_attempt_at");

CREATE TABLE "notification_suppressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade, "user_id" integer REFERENCES "users"("id") ON DELETE cascade, "relationship_id" uuid REFERENCES "relationships"("id") ON DELETE cascade, "channel" text NOT NULL, "purpose" text NOT NULL DEFAULT 'all', "reason" text NOT NULL, "source" text NOT NULL, "expires_at" timestamp, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notification_suppressions_recipient_check" CHECK (("user_id" IS NOT NULL)::integer + ("relationship_id" IS NOT NULL)::integer = 1), CONSTRAINT "notification_suppressions_channel_check" CHECK ("channel" IN ('in_app','email','push','all'))
);
CREATE INDEX "notification_suppressions_recipient_idx" ON "notification_suppressions" ("business_id", "user_id", "relationship_id", "channel");

CREATE TABLE "user_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "blocker_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "blocked_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "user_blocks_pair_unique" UNIQUE ("blocker_user_id", "blocked_user_id"), CONSTRAINT "user_blocks_not_self_check" CHECK ("blocker_user_id" <> "blocked_user_id")
);
CREATE TABLE "content_moderation_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "target_type" text NOT NULL, "target_id" text NOT NULL, "visibility" text NOT NULL DEFAULT 'visible', "sensitive" boolean NOT NULL DEFAULT false, "reason" text, "decided_by_user_id" integer REFERENCES "users"("id") ON DELETE set null, "decided_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "content_moderation_states_target_unique" UNIQUE ("target_type", "target_id"), CONSTRAINT "content_moderation_states_visibility_check" CHECK ("visibility" IN ('visible','restricted','removed'))
);
CREATE TABLE "discovery_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade, "interests" json NOT NULL DEFAULT '[]'::json, "hidden_creator_ids" json NOT NULL DEFAULT '[]'::json, "sensitive_content" text NOT NULL DEFAULT 'reduce', "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "discovery_preferences_sensitive_check" CHECK ("sensitive_content" IN ('allow','reduce','hide'))
);
CREATE TABLE "discovery_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "key" text NOT NULL, "version" integer NOT NULL, "status" text NOT NULL DEFAULT 'draft', "weights" json NOT NULL, "guardrails" json NOT NULL, "created_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "created_at" timestamp NOT NULL DEFAULT now(), "activated_at" timestamp, CONSTRAINT "discovery_policies_key_version_unique" UNIQUE ("key", "version"), CONSTRAINT "discovery_policies_status_check" CHECK ("status" IN ('draft','active','retired','rolled_back')), CONSTRAINT "discovery_policies_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "discovery_policies_active_key_unique" ON "discovery_policies" ("key") WHERE "status" = 'active';
CREATE TABLE "discovery_exposures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE cascade, "mode" text NOT NULL, "policy_version" integer NOT NULL, "rank" integer NOT NULL, "score" double precision NOT NULL, "explanation" json NOT NULL DEFAULT '[]'::json, "request_id" text NOT NULL, "exposed_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "discovery_exposures_request_post_unique" UNIQUE ("request_id", "post_id"), CONSTRAINT "discovery_exposures_mode_check" CHECK ("mode" IN ('following','chronological','recommended'))
);
CREATE INDEX "discovery_exposures_user_idx" ON "discovery_exposures" ("user_id", "exposed_at");
CREATE TABLE "search_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "entity_type" text NOT NULL, "entity_id" text NOT NULL, "owner_user_id" integer REFERENCES "users"("id") ON DELETE cascade, "visibility" text NOT NULL DEFAULT 'public', "status" text NOT NULL DEFAULT 'active', "title" text NOT NULL, "body" text NOT NULL DEFAULT '', "metadata" json NOT NULL DEFAULT '{}'::json, "updated_at" timestamp NOT NULL DEFAULT now(), "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'B')) STORED, CONSTRAINT "search_documents_entity_unique" UNIQUE ("entity_type", "entity_id"), CONSTRAINT "search_documents_visibility_check" CHECK ("visibility" IN ('public','authenticated','private')), CONSTRAINT "search_documents_status_check" CHECK ("status" IN ('active','restricted','removed'))
);
CREATE INDEX "search_documents_status_idx" ON "search_documents" ("visibility", "status", "entity_type");
CREATE INDEX "search_documents_vector_idx" ON "search_documents" USING gin ("search_vector");

CREATE TABLE "asset_provenance_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade, "asserted_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "kind" text NOT NULL, "provider" text, "model" text, "tool" text, "disclosure" text NOT NULL DEFAULT '', "source_asset_ids" json NOT NULL DEFAULT '[]'::json, "metadata" json NOT NULL DEFAULT '{}'::json, "inherited_from_claim_id" uuid REFERENCES "asset_provenance_claims"("id") ON DELETE set null, "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "asset_provenance_claims_kind_check" CHECK ("kind" IN ('human_created','ai_assisted','ai_generated','synthetic_media','cloned_voice','edited_derivative'))
);
CREATE INDEX "asset_provenance_claims_asset_idx" ON "asset_provenance_claims" ("asset_id", "created_at");
CREATE TABLE "rights_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "asset_id" uuid REFERENCES "assets"("id") ON DELETE set null, "target_type" text NOT NULL, "target_id" text NOT NULL, "case_type" text NOT NULL, "parent_case_id" uuid REFERENCES "rights_cases"("id") ON DELETE set null, "submitted_by_user_id" integer REFERENCES "users"("id") ON DELETE set null, "claimant_name" text NOT NULL, "contact_email" text NOT NULL, "statement" text NOT NULL, "jurisdiction" text, "evidence" json NOT NULL DEFAULT '[]'::json, "status" text NOT NULL DEFAULT 'submitted', "assigned_reviewer_user_id" integer REFERENCES "users"("id") ON DELETE set null, "decision" text, "due_at" timestamp, "submitted_at" timestamp NOT NULL DEFAULT now(), "decided_at" timestamp, "updated_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "rights_cases_type_check" CHECK ("case_type" IN ('takedown','counter_notice','appeal')), CONSTRAINT "rights_cases_status_check" CHECK ("status" IN ('submitted','under_review','actioned','countered','appealed','resolved','rejected','withdrawn'))
);
CREATE INDEX "rights_cases_target_idx" ON "rights_cases" ("target_type", "target_id", "status"); CREATE INDEX "rights_cases_parent_idx" ON "rights_cases" ("parent_case_id");
CREATE TABLE "rights_case_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "case_id" uuid NOT NULL REFERENCES "rights_cases"("id") ON DELETE cascade, "actor_user_id" integer REFERENCES "users"("id") ON DELETE set null, "event_type" text NOT NULL, "note" text NOT NULL DEFAULT '', "evidence" json NOT NULL DEFAULT '{}'::json, "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "rights_case_events_case_idx" ON "rights_case_events" ("case_id", "created_at");
CREATE TABLE "repeat_infringer_strikes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade, "case_id" uuid NOT NULL REFERENCES "rights_cases"("id") ON DELETE restrict, "status" text NOT NULL DEFAULT 'active', "reason" text NOT NULL, "issued_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict, "issued_at" timestamp NOT NULL DEFAULT now(), "reversed_at" timestamp, CONSTRAINT "repeat_infringer_strikes_case_user_unique" UNIQUE ("case_id", "user_id"), CONSTRAINT "repeat_infringer_strikes_status_check" CHECK ("status" IN ('active','reversed','expired'))
);
CREATE INDEX "repeat_infringer_strikes_user_idx" ON "repeat_infringer_strikes" ("user_id", "status");

ALTER TABLE "orders" ADD COLUMN "attribution_context" json NOT NULL DEFAULT '{}'::json;

ALTER TABLE "posts" ADD COLUMN "media_asset_id" uuid REFERENCES "assets"("id") ON DELETE set null;
CREATE INDEX "posts_media_asset_id_idx" ON "posts" ("media_asset_id") WHERE "media_asset_id" IS NOT NULL;
