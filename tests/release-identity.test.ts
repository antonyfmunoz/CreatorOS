import { describe, expect, it } from "vitest";
import { buildReleaseIdentity, expectedMigrationLedger } from "../server/release-identity";

const exactLedger = {
  count: expectedMigrationLedger.count,
  latest: expectedMigrationLedger.latest,
};

describe("release identity", () => {
  it("verifies an exact production build and migration ledger without exposing arbitrary environment values", () => {
    const result = buildReleaseIdentity({
      NODE_ENV: "production",
      CREATIVESOS_SOURCE_COMMIT: "a".repeat(40),
      CREATIVESOS_SOURCE_FINGERPRINT: "b".repeat(64),
      CREATIVESOS_BUILD_ID: "20260815T120000Z-bbbbbbbbbbbb",
      CREATIVESOS_BUILD_TIME: "2026-08-15T12:00:00.000Z",
      CREATIVESOS_SOURCE_DIRTY: "false",
      DATABASE_URL: "must-never-appear",
    }, exactLedger);

    expect(result).toMatchObject({
      status: "verified",
      build: {
        sourceCommit: "a".repeat(40),
        sourceFingerprint: "b".repeat(64),
        sourceDirty: false,
        identityVerified: true,
      },
      migrations: { parity: true },
    });
    expect(JSON.stringify(result)).not.toContain("must-never-appear");
  });

  it("fails production identity closed when metadata is absent or malformed", () => {
    const result = buildReleaseIdentity({
      NODE_ENV: "production",
      CREATIVESOS_SOURCE_COMMIT: "not-a-commit",
      CREATIVESOS_BUILD_ID: "contains spaces and must be rejected",
    }, exactLedger);

    expect(result.status).toBe("unverified");
    expect(result.build).toMatchObject({
      id: null,
      sourceCommit: null,
      sourceFingerprint: null,
      sourceDirty: null,
      identityVerified: false,
    });
  });

  it("fails closed when the live migration ledger drifts from the checked-in release", () => {
    const result = buildReleaseIdentity({ NODE_ENV: "development" }, {
      count: Math.max(0, expectedMigrationLedger.count - 1),
      latest: expectedMigrationLedger.latest,
    });

    expect(result.status).toBe("unverified");
    expect(result.migrations.parity).toBe(false);
  });
});
