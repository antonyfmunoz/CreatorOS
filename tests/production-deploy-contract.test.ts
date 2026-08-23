import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploySource = readFileSync(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");
const dockerSource = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8");
const verifyWorkflowSource = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
const cleanSourceContract = readFileSync(new URL("../scripts/assert-clean-source.mjs", import.meta.url), "utf8");
const dockerIgnoreSource = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");

describe("production deployment contract", () => {
  it("applies the current additive ledger before deploy and verifies it again after deploy", () => {
    const calls = deploySource.match(/node scripts\/migrate-production\.mjs/g) ?? [];
    const snapshotDependencyIndex = deploySource.indexOf("npm ci --ignore-scripts --no-audit --no-fund");
    expect(calls).toHaveLength(2);
    expect(snapshotDependencyIndex).toBeGreaterThan(deploySource.indexOf("Push-Location $snapshotPath"));
    expect(snapshotDependencyIndex).toBeLessThan(deploySource.indexOf(calls[0]));
    expect(deploySource).toContain("Unable to hydrate immutable release dependencies");
    expect(deploySource.indexOf(calls[0])).toBeLessThan(deploySource.indexOf("flyctl deploy"));
    expect(deploySource.lastIndexOf(calls[1])).toBeGreaterThan(deploySource.indexOf("flyctl deploy"));
  });

  it("fails when production does not contain the exact checked-in ledger", () => {
    expect(migrationSource).toContain("Production migration ledger mismatch");
    expect(migrationSource).toContain("finalRow.count !== migrationFiles.length");
    expect(migrationSource).toContain("actualLatest !== expectedLatest");
  });

  it("embeds a non-secret exact-source identity into every production image", () => {
    const cleanIndex = deploySource.indexOf("node scripts/assert-clean-source.mjs");
    const archiveIndex = deploySource.indexOf("git archive --format=tar");
    const fingerprintIndex = deploySource.indexOf("Get-FileHash -LiteralPath $archivePath");
    const deployIndex = deploySource.indexOf("flyctl deploy .");
    expect(deploySource).toContain("Production releases require a clean source worktree");
    expect(cleanIndex).toBeGreaterThan(-1);
    expect(cleanIndex).toBeLessThan(archiveIndex);
    expect(archiveIndex).toBeLessThan(fingerprintIndex);
    expect(fingerprintIndex).toBeLessThan(deployIndex);
    expect(deploySource.lastIndexOf("node scripts/assert-clean-source.mjs")).toBeLessThan(deployIndex);
    expect(deploySource).toContain("Push-Location $snapshotPath");
    expect(deploySource).toContain("Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force");
    expect(deploySource).toContain('$sourceDirty = "false"');
    expect(cleanSourceContract).toContain('"status", "--porcelain=v1"');
    expect(cleanSourceContract).toContain('"--untracked-files=normal"');
    expect(workflowSource).toContain("node scripts/assert-clean-source.mjs");
    expect(verifyWorkflowSource).toContain("node scripts/assert-clean-source.mjs");
    for (const ignored of ["dump*.sql", "*.tar.gz.env", ".wrangler", "test-results", "playwright-report"]) {
      expect(dockerIgnoreSource).toContain(ignored);
    }
    expect(dockerIgnoreSource).not.toMatch(/^uploads\/?$/m);
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
    expect(deploySource).toContain('--build-arg "CREATIVESOS_SOURCE_DIRTY=$sourceDirty"');
    expect(deploySource).toContain("https://creativesos.net/api/release");
    expect(deploySource).toContain("releaseIdentity.build.sourceFingerprint -ne $sourceFingerprint");
    expect(deploySource).toContain("releaseIdentity.build.sourceDirty -ne $false");
    expect(deploySource).toContain("releaseIdentity.migrations.parity -ne $true");
  });

  it("keeps production deployment manual, main-only, serialized, backed up, and environment-gated", () => {
    expect(workflowSource.indexOf("node scripts/assert-clean-source.mjs")).toBeLessThan(
      workflowSource.indexOf("run: npm run verify:secrets"),
    );
    expect(verifyWorkflowSource.indexOf("node scripts/assert-clean-source.mjs")).toBeLessThan(
      verifyWorkflowSource.indexOf("run: npm run verify:secrets"),
    );
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

  it("fails protected verification on moderate or higher findings anywhere in the dependency graph", () => {
    expect(verifyWorkflowSource).toContain("name: Audit production and build dependency graph");
    expect(verifyWorkflowSource).toContain("run: npm audit --audit-level=moderate");
    expect(verifyWorkflowSource).not.toContain("npm audit --omit=dev");
  });

  it("makes exact-source public browser smoke part of every successful production deployment", () => {
    const deployStepIndex = workflowSource.indexOf("Execute fail-closed production release");
    const smokeStepIndex = workflowSource.indexOf("Verify exact deployed release through the public application boundary");
    expect(deployStepIndex).toBeGreaterThan(-1);
    expect(smokeStepIndex).toBeGreaterThan(deployStepIndex);
    expect(workflowSource).toContain("CREATIVESOS_PRODUCTION_SMOKE_MODE: public");
    expect(workflowSource).toContain("CREATIVESOS_EXPECTED_COMMIT: ${{ github.sha }}");
    expect(workflowSource).toContain("npm run verify:production-smoke:public");
    expect(workflowSource).toContain("post-deploy-public-smoke-evidence");
  });

  it("compiles the synchronized Android shell on the protected Linux workflow", () => {
    expect(verifyWorkflowSource).toContain("name: Android native shell");
    expect(verifyWorkflowSource).toContain("actions/setup-java@v5");
    expect(verifyWorkflowSource).toContain("npm run mobile:sync");
    expect(verifyWorkflowSource).toContain("./gradlew assembleDebug --no-daemon");
  });

  it("compiles the synchronized iOS shell without signing on the protected macOS workflow", () => {
    expect(verifyWorkflowSource).toContain("name: iOS native shell");
    expect(verifyWorkflowSource).toContain("runs-on: macos-15");
    expect(verifyWorkflowSource).toContain("-project ios/App/App.xcodeproj");
    expect(verifyWorkflowSource).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(verifyWorkflowSource.match(/node scripts\/assert-clean-source\.mjs/g)).toHaveLength(5);
  });
});
