import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0084_media_cloud.sql", import.meta.url), "utf8");

describe("Media Cloud migration", () => {
  it("persists processing, rendition, caption, lineage, DAM, and playback contracts", () => {
    for (const table of [
      "media_processing_jobs",
      "media_renditions",
      "media_text_tracks",
      "asset_lineage_edges",
      "asset_collections",
      "asset_collection_items",
      "media_playback_sessions",
      "media_playback_events",
      "asset_tags",
      "asset_rights",
      "asset_usage_records",
      "analytics_events",
      "analytics_identity_links",
      "attribution_touches",
      "conversion_attributions",
      "analytics_experiments",
      "analytics_experiment_assignments",
      "creative_work_items",
      "creative_work_dependencies",
      "creative_work_approvals",
    ]) expect(migration).toContain(`CREATE TABLE "${table}"`);
  });

  it("enforces idempotency, tenant-safe uniqueness, workflow state, and lineage integrity", () => {
    expect(migration).toContain("media_processing_jobs_state_check");
    expect(migration).toContain("media_renditions_asset_key_unique");
    expect(migration).toContain("asset_lineage_edges_not_self_check");
    expect(migration).toContain("media_playback_events_session_sequence_unique");
    expect(migration).toContain("media_playback_sessions_counts_check");
    expect(migration).toContain('ALTER TABLE "posts" ADD COLUMN "media_asset_id"');
    expect(migration).toContain('CREATE INDEX "posts_media_asset_id_idx"');
    expect(migration).toContain("asset_rights_status_check");
    expect(migration).toContain("asset_usage_records_usage_unique");
    expect(migration).toContain("creativesos_assets_seed_rights");
    expect(migration).toContain("analytics_events_name_check");
    expect(migration).toContain("conversion_attributions_order_touch_model_unique");
    expect(migration).toContain('ALTER TABLE "orders" ADD COLUMN "attribution_context"');
    expect(migration).toContain("creative_work_dependencies_not_self_check");
    expect(migration).toContain("creative_work_approvals_item_pending_unique");
  });
});
