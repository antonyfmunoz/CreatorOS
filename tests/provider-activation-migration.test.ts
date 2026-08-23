import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0105_provider_activation_control_plane.sql", import.meta.url), "utf8");
const routes = readFileSync(new URL("../server/provider-activation.ts", import.meta.url), "utf8");

describe("provider activation persistence", () => {
  it("creates business-scoped runs and append-only evidence", () => {
    expect(migration).toContain('CREATE TABLE "provider_activation_runs"');
    expect(migration).toContain('CREATE TABLE "provider_activation_evidence"');
    expect(migration).toContain('REFERENCES "businesses"("id") ON DELETE CASCADE');
    expect(migration).toContain('FOREIGN KEY ("run_id", "business_id") REFERENCES "provider_activation_runs"("id", "business_id") ON DELETE CASCADE');
    expect(migration).toContain('"outcome" <> \'passed\' OR "evidence_url" IS NOT NULL');
    expect(migration).toContain('"expires_at" > "observed_at"');
    expect(migration).toContain('"closed_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL');
  });

  it("keeps evidence immutable and gates qualification on derived state", () => {
    expect(routes).toContain("if (!qualification.qualifiable)");
    expect(routes).toContain("Every required stage needs current passing evidence");
    expect(routes).not.toMatch(/app\.(?:put|patch|delete)\("\/api\/provider-activations\/runs\/[^\n]*evidence/);
    expect(routes.match(/pg_advisory_xact_lock/g)).toHaveLength(3);
    expect(routes).toContain("RUN_HISTORY_LIMIT = 100");
    expect(routes).toContain("select distinct on (provider, environment)");
  });
});
