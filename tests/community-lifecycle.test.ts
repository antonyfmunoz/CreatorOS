import { describe, expect, it } from "vitest";
import { communities } from "../shared/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("community lifecycle", () => {
  it("keeps the archive field and migration together", () => {
    expect(communities.archivedAt.name).toBe("archived_at");
    const migration = readFileSync(
      resolve(process.cwd(), "migrations/0024_community_archival.sql"),
      "utf8",
    );
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "archived_at" timestamp',
    );
    expect(migration).toContain(
      'CREATE INDEX IF NOT EXISTS "communities_archived_at_idx"',
    );
  });

  it("repairs the membership table that gates community access", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "migrations/0025_community_memberships.sql"),
      "utf8",
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "community_memberships"',
    );
    expect(migration).toContain(
      'CONSTRAINT "user_community_unique" UNIQUE("user_id", "community_id")',
    );
    expect(migration).toContain('UPDATE "communities" AS "community"');
  });

  it("gives every community a default conversation channel", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "migrations/0039_community_default_channels.sql"),
      "utf8",
    );
    expect(migration).toContain('INSERT INTO "channels"');
    expect(migration).toContain("WHERE NOT EXISTS");
    expect(migration).toContain("'general'");
  });
});
