import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0083_ugc_marketplace.sql", import.meta.url), "utf8");

describe("UGC marketplace migration", () => {
  it("persists the complete brief-to-earnings lifecycle", () => {
    for (const table of ["ugc_creator_profiles", "ugc_portfolio_items", "ugc_opportunities", "ugc_applications", "ugc_collaborations", "ugc_submissions", "ugc_performance_snapshots", "ugc_earnings_ledger"])
      expect(migration).toContain(`CREATE TABLE "${table}"`);
  });

  it("enforces compensation, workflow, version, and ledger idempotency", () => {
    expect(migration).toContain("ugc_opportunities_compensation_terms_check");
    expect(migration).toContain("ugc_applications_opportunity_creator_unique");
    expect(migration).toContain("ugc_submissions_collaboration_version_unique");
    expect(migration).toContain("ugc_earnings_ledger_source_unique");
    expect(migration).toContain("'revision_requested'");
  });
});
