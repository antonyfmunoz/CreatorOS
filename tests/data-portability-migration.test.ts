import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0101_data_portability.sql", import.meta.url), "utf8");

describe("data portability migration", () => {
  it("keeps import jobs tenant-scoped, replay-safe and traceable", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "data_import_jobs"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "data_import_records"');
    expect(migration).toContain("data_import_jobs_business_idempotency_unique");
    expect(migration).toContain("data_import_records_source_unique");
    expect(migration).toContain('"payload_hash" text NOT NULL');
    expect(migration).not.toContain('"raw_secret"');
  });
});
