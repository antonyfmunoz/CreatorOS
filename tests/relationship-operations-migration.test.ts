import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("relationship operations migration", () => {
  const migration = fs.readFileSync(path.resolve("migrations/0057_relationship_operations_and_realtime_bridge.sql"), "utf8");

  it("creates tenant controls, idempotent metering, alerts, and the room bridge", () => {
    expect(migration).toContain('CREATE TABLE "relationship_tenant_policies"');
    expect(migration).toContain('CREATE TABLE "relationship_usage_ledger"');
    expect(migration).toContain('CREATE TABLE "relationship_operational_alerts"');
    expect(migration).toContain('CREATE TABLE "relationship_room_bindings"');
    expect(migration).toContain('"relationship_usage_business_key_unique"');
    expect(migration).toContain('REFERENCES "public"."community_rooms"("id")');
    expect(migration).toContain('REFERENCES "public"."relationships"("id")');
  });
});
