import { describe, expect, it } from "vitest";
import {
  benchmarkReductionBps,
  benchmarkEnvironmentSchema,
  benchmarkFamilies,
  competitiveState,
  completeBenchmarkRunSchema,
  requiredBenchmarkEvidenceKinds,
  startBenchmarkRunSchema,
} from "../shared/competitive-benchmarks";

describe("competitive benchmark contract", () => {
  it("covers every canonical product family exactly once", () => {
    expect(benchmarkFamilies).toHaveLength(20);
    expect(new Set(benchmarkFamilies).size).toBe(benchmarkFamilies.length);
    expect(benchmarkFamilies).toEqual(
      expect.arrayContaining([
        "native_social",
        "communities_learning",
        "marketplace_commerce",
        "ugc",
        "relationship_automation",
        "distribution",
        "media_hosting_dam",
        "planning_work_management",
        "cut_studio",
        "broadcast_conference",
        "meeting_intelligence",
        "audience_email",
        "design_studio",
        "podcasting",
        "creator_site",
        "commercial_growth",
        "business_analytics",
        "trust_operations",
        "developer_ecosystem",
        "connected_creation_loop",
      ]),
    );
  });

  it("requires named comparison products and complete evidence", () => {
    expect(
      benchmarkEnvironmentSchema.safeParse({
        protocolVersion: "1",
        sourceManifestId: "manifest:test",
        deviceClass: "desktop-browser",
        networkClass: "broadband",
        operatorSkillLevel: "trained",
        locale: "en-US",
      }).success,
    ).toBe(true);
    expect(
      startBenchmarkRunSchema.safeParse({
        implementation: "comparison",
        comparisonProduct: null,
        environment: {},
      }).success,
    ).toBe(false);
    expect(
      startBenchmarkRunSchema.safeParse({
        implementation: "creativesos",
        comparisonProduct: "Instagram",
        environment: {},
      }).success,
    ).toBe(false);
    expect(
      completeBenchmarkRunSchema.safeParse({
        status: "completed",
        activeTimeMs: 60_000,
        elapsedTimeMs: 90_000,
        applicationCount: 1,
        exportCount: 0,
        uploadCount: 0,
        manualHandoffCount: 0,
        actionCount: 20,
        retryCount: 0,
        failureCount: 0,
        unrecoverableErrorCount: 0,
        outputQualityScore: 5,
        safetyScore: 5,
        reliabilityScore: 5,
        accessibilityScore: 5,
        notes: "A complete operator record with failures and exclusions.",
        evidence: [],
      }).success,
    ).toBe(false);
    expect(
      completeBenchmarkRunSchema.safeParse({
        status: "completed",
        activeTimeMs: 60_000,
        elapsedTimeMs: 90_000,
        applicationCount: 1,
        exportCount: 0,
        uploadCount: 0,
        manualHandoffCount: 0,
        actionCount: 20,
        retryCount: 0,
        failureCount: 0,
        unrecoverableErrorCount: 0,
        outputQualityScore: 5,
        safetyScore: 5,
        reliabilityScore: 5,
        accessibilityScore: 5,
        notes: "A complete operator record with immutable evidence artifacts.",
        evidence: requiredBenchmarkEvidenceKinds.map((kind) => ({
          kind,
          uri: `artifact://benchmark/${kind}`,
          checksum: `sha256:${kind}`,
        })),
      }).success,
    ).toBe(true);
  });

  it("calculates the two connected-advantage thresholds exactly", () => {
    expect(benchmarkReductionBps(100, 75)).toBe(2_500);
    expect(benchmarkReductionBps(4, 2)).toBe(5_000);
    expect(benchmarkReductionBps(0, 0)).toBe(0);
  });

  it("never awards advantage when quality, safety, or recovery regresses", () => {
    expect(
      competitiveState({
        qualityComparable: true,
        nativeScores: [4.5, 4.5, 4.5, 4.5],
        comparisonScores: [4.8, 4.8, 4.8, 4.8],
        activeTimeReductionBps: 2_500,
        handoffReductionBps: 5_000,
        nativeUnrecoverableErrors: 0,
      }),
    ).toBe("connected_advantage_proven");
    expect(
      competitiveState({
        qualityComparable: true,
        nativeScores: [4, 5, 5, 5],
        comparisonScores: [5, 5, 5, 5],
        activeTimeReductionBps: 9_000,
        handoffReductionBps: 9_000,
        nativeUnrecoverableErrors: 0,
      }),
    ).toBe("parity_failed");
    expect(
      competitiveState({
        qualityComparable: true,
        nativeScores: [5, 5, 5, 5],
        comparisonScores: [5, 5, 5, 5],
        activeTimeReductionBps: 9_000,
        handoffReductionBps: 9_000,
        nativeUnrecoverableErrors: 1,
      }),
    ).toBe("parity_failed");
  });
});
