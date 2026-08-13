import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0065_broadcast_studio.sql", import.meta.url), "utf8");
const multiDestinationMigration = readFileSync(new URL("../migrations/0066_broadcast_multidestination.sql", import.meta.url), "utf8");
const productionEvidenceMigration = readFileSync(new URL("../migrations/0068_broadcast_production_evidence.sql", import.meta.url), "utf8");
const collaborationMigration = readFileSync(new URL("../migrations/0074_broadcast_studio_collaboration.sql", import.meta.url), "utf8");
const audienceMigration = readFileSync(new URL("../migrations/0075_broadcast_audience_control.sql", import.meta.url), "utf8");

describe("Broadcast Studio migration", () => {
  it("persists studios, encrypted destinations, and durable sessions", () => {
    expect(migration).toContain('CREATE TABLE "broadcast_studios"');
    expect(migration).toContain('CREATE TABLE "broadcast_destinations"');
    expect(migration).toContain('"stream_key_ciphertext" text NOT NULL');
    expect(migration).toContain('CREATE TABLE "broadcast_sessions"');
    expect(migration).toContain('broadcast_sessions_one_active_per_owner');
  });

  it("enforces safe lifecycle enums and cascading ownership", () => {
    expect(migration).toContain("'starting', 'live', 'stopping', 'complete', 'error', 'interrupted'");
    expect(migration).toContain("ON DELETE cascade");
  });

  it("adds durable multi-destination lineage", () => {
    expect(multiDestinationMigration).toContain('ADD COLUMN IF NOT EXISTS "destination_ids" json');
    expect(multiDestinationMigration).toContain('json_build_array("destination_id")');
  });

  it("persists owner-scoped production markers and destination receipts", () => {
    expect(productionEvidenceMigration).toContain('CREATE TABLE "broadcast_session_markers"');
    expect(productionEvidenceMigration).toContain('CREATE TABLE "broadcast_destination_receipts"');
    expect(productionEvidenceMigration).toContain('broadcast_session_markers_kind_check');
    expect(productionEvidenceMigration).toContain('broadcast_destination_receipts_state_check');
    expect(productionEvidenceMigration).toContain('broadcast_destination_receipts_session_destination_unique');
  });

  it("adds role-scoped studio collaborators", () => {
    expect(collaborationMigration).toContain('CREATE TABLE "broadcast_studio_collaborators"');
    expect(collaborationMigration).toContain('broadcast_studio_collaborators_studio_user_unique');
    expect(collaborationMigration).toContain("'viewer', 'editor'");
    expect(collaborationMigration).toContain('ON DELETE cascade');
  });

  it("persists a moderated provider-neutral audience timeline", () => {
    expect(audienceMigration).toContain('CREATE TABLE "broadcast_audience_messages"');
    expect(audienceMigration).toContain('broadcast_audience_messages_provider_external_unique');
    expect(audienceMigration).toContain("'comment', 'cta'");
    expect(audienceMigration).toContain("'visible', 'hidden'");
  });
});
