import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operations control plane migration", () => {
  const migration = readFileSync("migrations/0098_operational_control_plane.sql", "utf8");
  it("persists objectives evidence, usage, budgets, and distributed rate windows", () => {
    for (const table of ["operational_service_events", "operational_usage_events", "operational_budgets", "developer_api_rate_windows"])
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    expect(migration).toContain("operational_budgets_limits_check");
    expect(migration).toContain("developer_api_rate_windows_key_window_unique");
  });
});
