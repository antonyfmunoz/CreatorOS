import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0064_cut_studio.sql", import.meta.url), "utf8");
const multitrackMigration = readFileSync(new URL("../migrations/0067_cut_studio_multitrack.sql", import.meta.url), "utf8");

describe("CutStudio persistence migration", () => {
  it("creates owner-scoped projects and durable jobs", () => {
    expect(migration).toContain('CREATE TABLE "cut_studio_projects"');
    expect(migration).toContain('CREATE TABLE "cut_studio_jobs"');
    expect(migration).toContain('REFERENCES "public"."users"("id") ON DELETE cascade');
    expect(migration).toContain('CONSTRAINT "cut_studio_jobs_progress_check"');
    expect(migration).toContain('"artifact_asset_id" uuid');
  });

  it("adds an owner-scoped project media library and backfills primary sources", () => {
    expect(multitrackMigration).toContain('CREATE TABLE "cut_studio_project_media"');
    expect(multitrackMigration).toContain('CONSTRAINT "cut_studio_project_media_project_asset_unique"');
    expect(multitrackMigration).toContain('REFERENCES "public"."assets"("id") ON DELETE restrict');
    expect(multitrackMigration).toContain('INSERT INTO "cut_studio_project_media"');
    expect(multitrackMigration).toContain('ON CONFLICT ("project_id", "asset_id") DO NOTHING');
  });
});
