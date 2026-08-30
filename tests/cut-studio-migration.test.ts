import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0064_cut_studio.sql", import.meta.url), "utf8");
const multitrackMigration = readFileSync(new URL("../migrations/0067_cut_studio_multitrack.sql", import.meta.url), "utf8");
const reviewMigration = readFileSync(new URL("../migrations/0069_cut_studio_review.sql", import.meta.url), "utf8");
const collaborationMigration = readFileSync(new URL("../migrations/0071_cut_studio_workspace_collaboration.sql", import.meta.url), "utf8");
const audioTemplateMigration = readFileSync(new URL("../migrations/0077_cut_studio_audio_templates.sql", import.meta.url), "utf8");
const programmableCinemaMigration = readFileSync(new URL("../migrations/0114_cut_studio_programmable_cinema.sql", import.meta.url), "utf8");

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

  it("adds immutable review versions, revocable links, comments, and decisions", () => {
    expect(reviewMigration).toContain('CREATE TABLE "cut_studio_versions"');
    expect(reviewMigration).toContain('CREATE TABLE "cut_studio_review_links"');
    expect(reviewMigration).toContain('CREATE TABLE "cut_studio_review_comments"');
    expect(reviewMigration).toContain('CREATE TABLE "cut_studio_review_decisions"');
    expect(reviewMigration).toContain('cut_studio_review_links_token_hash_unique');
    expect(reviewMigration).toContain('cut_studio_review_comments_position_check');
    expect(reviewMigration).toContain('cut_studio_review_decisions_decision_check');
  });

  it("adds project-scoped workspace collaborators and mentionable notes", () => {
    expect(collaborationMigration).toContain('CREATE TABLE "cut_studio_collaborators"');
    expect(collaborationMigration).toContain('CREATE TABLE "cut_studio_workspace_notes"');
    expect(collaborationMigration).toContain('cut_studio_collaborators_project_user_unique');
    expect(collaborationMigration).toContain('cut_studio_workspace_notes_body_check');
    expect(collaborationMigration).toContain('cut_studio_workspace_notes_position_check');
  });

  it("adds a business-scoped portable audio routing template library", () => {
    expect(audioTemplateMigration).toContain('CREATE TABLE "cut_studio_audio_templates"');
    expect(audioTemplateMigration).toContain('cut_studio_audio_templates_business_name_unique');
    expect(audioTemplateMigration).toContain('REFERENCES "public"."businesses"("id") ON DELETE cascade');
    expect(audioTemplateMigration).toContain('REFERENCES "public"."users"("id") ON DELETE cascade');
  });

  it("adds durable programmable compositions, production continuity, workflows, jobs, and variants", () => {
    for (const table of ["cut_studio_compositions", "cut_studio_production_plans", "cut_studio_production_elements", "cut_studio_shots", "cut_studio_generation_jobs", "cut_studio_generative_workflows", "cut_studio_shot_variants"]) {
      expect(programmableCinemaMigration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(programmableCinemaMigration).toContain("cut_studio_generation_jobs_business_idempotency_unique");
    expect(programmableCinemaMigration).toContain("cut_studio_generation_jobs_state_check");
    expect(programmableCinemaMigration).toContain("cut_studio_generation_jobs_progress_check");
    expect(programmableCinemaMigration).toContain("cut_studio_shots_selected_variant_fk");
    expect(programmableCinemaMigration).toContain('REFERENCES "assets"("id") ON DELETE RESTRICT');
  });
});
