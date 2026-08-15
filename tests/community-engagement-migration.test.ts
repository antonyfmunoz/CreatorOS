import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/0096_community_engagement.sql", import.meta.url),
  "utf8",
);

describe("community engagement migration", () => {
  it("creates guided onboarding, immutable point evidence, and badges", () => {
    expect(migration).toContain('ADD COLUMN "onboarding_completed_at"');
    expect(migration).toContain(
      'CREATE TABLE "community_onboarding_questions"',
    );
    expect(migration).toContain(
      'CREATE TABLE "community_onboarding_responses"',
    );
    expect(migration).toContain('CREATE TABLE "community_point_events"');
    expect(migration).toContain("community_point_events_source_unique");
    expect(migration).toContain('CREATE TABLE "community_badges"');
    expect(migration).toContain('CREATE TABLE "community_member_badges"');
  });
});
