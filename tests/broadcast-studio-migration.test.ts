import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0065_broadcast_studio.sql", import.meta.url), "utf8");
const multiDestinationMigration = readFileSync(new URL("../migrations/0066_broadcast_multidestination.sql", import.meta.url), "utf8");

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
});
