import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deploySource = readFileSync(new URL("../scripts/deploy-production.ps1", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");
const dockerSource = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8");
const smokeWorkflowSource = readFileSync(new URL("../.github/workflows/production-smoke.yml", import.meta.url), "utf8");
const backupQualificationWorkflowSource = readFileSync(new URL("../.github/workflows/production-backup-qualification.yml", import.meta.url), "utf8");
const restoreDrillWorkflowSource = readFileSync(new URL("../.github/workflows/production-restore-drill.yml", import.meta.url), "utf8");
const restoreDrillSource = readFileSync(new URL("../scripts/qualify-production-restore.sh", import.meta.url), "utf8");
const recoveryDockerSource = readFileSync(new URL("../Dockerfile.recovery", import.meta.url), "utf8");
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

  it("mints short-lived Clerk authentication for dedicated production smoke journeys", () => {
    expect(smokeWorkflowSource).toContain("CREATIVESOS_PRODUCTION_SMOKE_USER_EMAIL: ${{ vars.CREATIVESOS_PRODUCTION_SMOKE_USER_EMAIL }}");
    expect(smokeWorkflowSource).toContain("CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}");
    expect(smokeWorkflowSource).toContain("CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}");
    expect(smokeWorkflowSource).toContain("npm run verify:production-smoke");
  });

  it("qualifies the newest private production backup without copying storage credentials into CI", () => {
    expect(backupQualificationWorkflowSource).toContain("schedule:");
    expect(backupQualificationWorkflowSource).toContain("workflow_dispatch:");
    expect(backupQualificationWorkflowSource).toContain("cancel-in-progress: false");
    expect(backupQualificationWorkflowSource).toContain("name: production");
    expect(backupQualificationWorkflowSource).toContain("secrets.FLY_API_TOKEN");
    expect(backupQualificationWorkflowSource).toContain("/api/release");
    expect(backupQualificationWorkflowSource).toContain("node scripts/inspect-production-backup.mjs");
    expect(backupQualificationWorkflowSource).toContain("production_backup_verified");
    expect(backupQualificationWorkflowSource).toContain("evidence.backupAgeSeconds > 108000");
    expect(backupQualificationWorkflowSource).toContain("retention-days: 90");
    expect(backupQualificationWorkflowSource).not.toContain("R2_ACCESS_KEY_ID");
    expect(backupQualificationWorkflowSource).not.toContain("R2_SECRET_ACCESS_KEY");
    expect(backupQualificationWorkflowSource).not.toContain("DATABASE_URL");
  });

  it("restores the newest production archive only inside an ephemeral private recovery machine", () => {
    expect(restoreDrillWorkflowSource).toContain("schedule:");
    expect(restoreDrillWorkflowSource).toContain("workflow_dispatch:");
    expect(restoreDrillWorkflowSource).toContain("group: creativesos-production");
    expect(restoreDrillWorkflowSource).toContain("secrets.FLY_API_TOKEN");
    expect(restoreDrillWorkflowSource).toContain("--region iad");
    expect(restoreDrillWorkflowSource).toContain("--skip-dns-registration");
    expect(restoreDrillWorkflowSource).toContain("--restart no");
    expect(restoreDrillWorkflowSource).toContain("--detach");
    expect(restoreDrillWorkflowSource).toContain('launch_status="${PIPESTATUS[0]}"');
    expect(restoreDrillWorkflowSource).toContain("for _ in $(seq 1 12)");
    expect(restoreDrillWorkflowSource).toContain("production-restore-machine-id.txt");
    expect(restoreDrillWorkflowSource).toContain("flyctl logs --app creatoros-app --machine");
    expect(restoreDrillWorkflowSource).toContain("flyctl machine destroy --app creatoros-app --force");
    expect(restoreDrillWorkflowSource).toContain("if: always()");
    expect(restoreDrillWorkflowSource).toContain("publicService !== false");
    expect(restoreDrillWorkflowSource).toContain("evidence.migrationCount !== release.migrations?.expected?.count");
    expect(restoreDrillWorkflowSource).toContain("evidence.backupAgeSeconds > 108000");
    expect(restoreDrillWorkflowSource).not.toContain("R2_ACCESS_KEY_ID");
    expect(restoreDrillWorkflowSource).not.toContain("R2_SECRET_ACCESS_KEY");
    expect(restoreDrillWorkflowSource).not.toContain("DATABASE_URL");
    expect(restoreDrillSource).toContain("begin transaction read only;");
    expect(restoreDrillSource).toContain("set local statement_timeout = '15s';");
    expect(restoreDrillSource).not.toContain("PGOPTIONS=");
    expect(restoreDrillSource).not.toContain("\r");
    expect(restoreDrillSource).toContain('chmod 0711 "${recovery_root}"');
    expect(restoreDrillSource).toContain('postgres_log="${cluster_path}/postgres.log"');
    expect(restoreDrillSource).toContain("listen_addresses=''");
    expect(restoreDrillSource).toContain("pg_restore");
    expect(restoreDrillSource).toContain("pending-migrations.sql");
    expect(restoreDrillSource).toContain("max_backup_age_seconds=108000");
    expect(restoreDrillSource).toContain("competitive_benchmark_remediations");
    expect(restoreDrillSource).toContain("orphan_direct_messages");
    expect(restoreDrillSource).toContain("CREATIVESOS_RECOVERY_EVIDENCE=");
    expect(recoveryDockerSource).toContain("FROM postgres:17-bookworm");
    expect(recoveryDockerSource).toContain("COPY migrations /opt/creativesos/migrations");
    expect(recoveryDockerSource).toContain('ENTRYPOINT ["/usr/local/bin/qualify-production-restore"]');
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
