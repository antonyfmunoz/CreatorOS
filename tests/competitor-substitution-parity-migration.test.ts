import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/0106_competitor_substitution_parity.sql", import.meta.url),
  "utf8",
);
const routes = readFileSync(
  new URL("../server/competitive-benchmarks.ts", import.meta.url),
  "utf8",
);
const remediationMigration = readFileSync(
  new URL("../migrations/0107_competitive_remediation_backlog.sql", import.meta.url),
  "utf8",
);

describe("competitor substitution parity persistence", () => {
  it("stores immutable definition requirements and assessment verdict totals", () => {
    expect(migration).toContain('ADD COLUMN "parity_requirements" json NOT NULL');
    expect(migration).toContain('ADD COLUMN "requirement_results" json NOT NULL');
    expect(migration).toContain('"passed_capability_count" + "failed_capability_count" = "required_capability_count"');
  });

  it("refuses aggregate-score parity without complete grounded capability verdicts", () => {
    expect(routes).toContain("Assess every locked required-parity capability");
    expect(routes).toContain("Capability verdicts must reference evidence present in both locked runs");
    expect(routes).toContain("requiredParityPassed: failedCapabilityCount === 0");
    expect(routes).toContain("parityRequirements: buildParityRequirements(template)");
  });

  it("turns every failed capability into governed planner work", () => {
    expect(remediationMigration).toContain("'product_gap'");
    expect(remediationMigration).toContain('DROP CONSTRAINT "creative_work_items_kind_check"');
    expect(remediationMigration).toContain('CREATE TABLE "competitive_benchmark_remediations"');
    expect(remediationMigration).toContain('"competitive_benchmark_remediations_resolution_check"');
    expect(routes).toContain('sourceType: "benchmark_remediation"');
    expect(routes).toContain('kind: "product_gap"');
    expect(routes).toContain('status: "resolved"');
    expect(routes).toContain("A remediation can close only after a passing locked retest");
  });
});
