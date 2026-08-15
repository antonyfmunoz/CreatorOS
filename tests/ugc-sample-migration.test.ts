import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/0095_ugc_sample_logistics.sql", import.meta.url),
  "utf8",
);

describe("UGC sample logistics migration", () => {
  it("adds immutable brief terms and an auditable shipment lifecycle", () => {
    expect(migration).toContain('ADD COLUMN "sample_terms"');
    expect(migration).toContain('CREATE TABLE "ugc_sample_shipments"');
    expect(migration).toContain('"recipient_address_ciphertext" text NOT NULL');
    expect(migration).toContain("ugc_sample_shipments_status_check");
  });
});
