import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploySource = readFileSync(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");
const dockerSource = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8");
const verifyWorkflowSource = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
const cleanSourceContract = readFileSync(new URL("../scripts/assert-clean-source.mjs", import.meta.url), "utf8");

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

  it("embeds a non-secret exact-source identity into every production image", () => {
    expect(deploySource).toContain("Production releases require a clean source worktree");
    expect(deploySource).toContain("node scripts/assert-clean-source.mjs");
    expect(deploySource).toContain('$sourceDirty = "false"');
    expect(cleanSourceContract).toContain('"status", "--porcelain=v1"');
    expect(cleanSourceContract).toContain('"--untracked-files=normal"');
    expect(workflowSource).toContain("node scripts/assert-clean-source.mjs");
    expect(verifyWorkflowSource).toContain("node scripts/assert-clean-source.mjs");
    expect(deploySource).toContain("node scripts/source-fingerprint.mjs");
    for (const name of [
      "CREATIVESOS_SOURCE_COMMIT",
      "CREATIVESOS_SOURCE_FINGERPRINT",
      "CREATIVESOS_SOURCE_DIRTY",
      "CREATIVESOS_BUILD_ID",
      "CREATIVESOS_BUILD_TIME",
    ]) {
      expect(deploySource).toContain(`--build-arg \"${name}=`);
      expect(dockerSource).toContain(`ARG ${name}`);
      expect(dockerSource).toContain(`ENV ${name}=$${name}`);
    }
    expect(deploySource).toContain("https://creativesos.net/api/release");
    expect(deploySource).toContain("releaseIdentity.build.sourceFingerprint -ne $sourceFingerprint");
    expect(deploySource).toContain("releaseIdentity.build.sourceDirty -ne $false");
    expect(deploySource).toContain("releaseIdentity.migrations.parity -ne $true");
  });

  it("keeps production deployment manual, main-only, serialized, backed up, and environment-gated", () => {
    expect(workflowSource).toContain("workflow_dispatch:");
    expect(workflowSource).toContain("github.ref == 'refs/heads/main'");
    expect(workflowSource).toContain("cancel-in-progress: false");
    expect(workflowSource).toContain("name: production");
    expect(workflowSource).toContain("secrets.FLY_API_TOKEN");
    expect(workflowSource).toContain("secrets.DISTRIBUTION_DISPATCH_SECRET");
    expect(workflowSource).toContain("superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1");
    expect(deploySource).toContain("/api/internal/operations/backup");
    expect(deploySource).toContain('backupReceipt.status -ne "completed"');
    expect(deploySource.indexOf("/api/internal/operations/backup")).toBeLessThan(deploySource.indexOf("node scripts/migrate-production.mjs"));
  });

  it("compiles the synchronized Android shell on the protected Linux workflow", () => {
    expect(verifyWorkflowSource).toContain("name: Android native shell");
    expect(verifyWorkflowSource).toContain("actions/setup-java@v5");
    expect(verifyWorkflowSource).toContain("npm run mobile:sync");
    expect(verifyWorkflowSource).toContain("./gradlew assembleDebug --no-daemon");
    expect(verifyWorkflowSource.match(/node scripts\/assert-clean-source\.mjs/g)).toHaveLength(3);
  });
});
