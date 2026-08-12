import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0064_cut_studio.sql", import.meta.url), "utf8");

describe("CutStudio persistence migration", () => {
  it("creates owner-scoped projects and durable jobs", () => {
    expect(migration).toContain('CREATE TABLE "cut_studio_projects"');
    expect(migration).toContain('CREATE TABLE "cut_studio_jobs"');
    expect(migration).toContain('REFERENCES "public"."users"("id") ON DELETE cascade');
    expect(migration).toContain('CONSTRAINT "cut_studio_jobs_progress_check"');
    expect(migration).toContain('"artifact_asset_id" uuid');
  });
});
