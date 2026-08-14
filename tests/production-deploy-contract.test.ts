import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploySource = readFileSync(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");

describe("production deployment contract", () => {
  it("applies the current additive ledger before deploy and verifies it again after deploy", () => {
    const calls = deploySource.match(/node scripts\/migrate-production\.mjs/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(deploySource.indexOf(calls[0])).toBeLessThan(deploySource.indexOf("flyctl deploy"));
    expect(deploySource.lastIndexOf(calls[1])).toBeGreaterThan(deploySource.indexOf("flyctl deploy"));
  });

  it("fails when production does not contain the exact checked-in ledger", () => {
    expect(migrationSource).toContain("Production migration ledger mismatch");
    expect(migrationSource).toContain("finalRow.count !== migrationFiles.length");
    expect(migrationSource).toContain("actualLatest !== expectedLatest");
  });
});
