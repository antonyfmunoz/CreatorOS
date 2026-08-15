import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/0072_broadcast_brand_library.sql", import.meta.url), "utf8");

describe("Broadcast brand library migration", () => {
  it("creates a durable account library with ownership and integrity controls", () => {
    expect(migration).toContain('CREATE TABLE "broadcast_brand_kits"');
    expect(migration).toContain('UNIQUE("owner_user_id", "name")');
    expect(migration).toContain('REFERENCES "public"."businesses"');
    expect(migration).toContain('REFERENCES "public"."assets"');
    expect(migration).toContain('CHECK ("primary_color"');
  });
});
