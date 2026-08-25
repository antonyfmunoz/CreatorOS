import { describe, expect, it } from "vitest";
import {
  assessBenchmarkSchema,
  attachBenchmarkEvidenceSchema,
  benchmarkReductionBps,
  benchmarkEnvironmentSchema,
  benchmarkFamilies,
  canTransitionBenchmarkRemediation,
  competitiveState,
  completeBenchmarkRunSchema,
  createBenchmarkDefinitionSchema,
  requiredBenchmarkEvidenceKinds,
  startBenchmarkRunSchema,
  updateBenchmarkRemediationSchema,
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
          checksum: `sha256:${"a".repeat(64)}`,
        })),
      }).success,
    ).toBe(true);
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
        notes: "A duplicate evidence kind must never satisfy the locked contract.",
        evidence: requiredBenchmarkEvidenceKinds.map((kind) => ({
          kind: kind === "run_recording" ? "output_artifact" : kind,
          uri: `artifact://benchmark/${kind}`,
          checksum: `sha256:${"b".repeat(64)}`,
        })),
      }).success,
    ).toBe(false);
    expect(
      attachBenchmarkEvidenceSchema.safeParse({
        kind: "run_recording",
        assetId: "01234567-89ab-4cde-8fab-0123456789ab",
      }).success,
    ).toBe(true);
    expect(
      attachBenchmarkEvidenceSchema.safeParse({
        kind: "unsupported",
        assetId: "not-an-asset",
      }).success,
    ).toBe(false);
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
        requiredParityPassed: true,
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
        requiredParityPassed: true,
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
        requiredParityPassed: true,
        nativeScores: [5, 5, 5, 5],
        comparisonScores: [5, 5, 5, 5],
        activeTimeReductionBps: 9_000,
        handoffReductionBps: 9_000,
        nativeUnrecoverableErrors: 1,
      }),
    ).toBe("parity_failed");
    expect(
      competitiveState({
        qualityComparable: true,
        requiredParityPassed: false,
        nativeScores: [5, 5, 5, 5],
        comparisonScores: [5, 5, 5, 5],
        activeTimeReductionBps: 9_000,
        handoffReductionBps: 9_000,
        nativeUnrecoverableErrors: 0,
      }),
    ).toBe("parity_failed");
  });

  it("requires a unique required-parity contract for every comparison product", () => {
    const definition = {
      family: "cut_studio",
      name: "Replace the normal professional creator edit workflow",
      targetUser: "A professional creator producing publish-ready video.",
      workflow: "Import, edit, review, render, and hand the approved master directly to distribution.",
      comparisonProducts: ["CapCut", "Premiere Pro"],
      outputSpecification: {},
      rubric: {},
      sourceReferences: [{ label: "Official source", url: "https://example.com/source", checkedAt: new Date() }],
      parityRequirements: [
        {
          id: "capcut-required-edit",
          comparisonProduct: "CapCut",
          capability: "Complete edit",
          acceptanceCriterion: "Complete the locked edit without a missing required workflow step.",
          tier: "required_parity",
        },
      ],
    };
    expect(createBenchmarkDefinitionSchema.safeParse(definition).success).toBe(false);
    const complete = {
      ...definition,
      parityRequirements: [
        ...definition.parityRequirements,
        {
          id: "premiere-required-edit",
          comparisonProduct: "Premiere Pro",
          capability: "Complete edit",
          acceptanceCriterion: "Complete the locked edit without a missing required workflow step.",
          tier: "required_parity",
        },
      ],
    };
    expect(createBenchmarkDefinitionSchema.safeParse(complete).success).toBe(true);
    expect(
      createBenchmarkDefinitionSchema.safeParse({
        ...complete,
        parityRequirements: [
          complete.parityRequirements[0],
          { ...complete.parityRequirements[1], id: complete.parityRequirements[0].id },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires one evidence-linked verdict per submitted capability", () => {
    const base = {
      creativesOsRunId: "11111111-1111-4111-8111-111111111111",
      comparisonRunId: "22222222-2222-4222-8222-222222222222",
      qualityComparable: true,
      reviewerNote: "The reviewer inspected both locked runs and documented the complete comparison.",
      requirementResults: [
        {
          requirementId: "capcut-required-edit",
          status: "passed",
          evidenceKinds: ["output_artifact"],
          note: "Both locked output artifacts prove the complete editing outcome.",
        },
      ],
    };
    expect(assessBenchmarkSchema.safeParse(base).success).toBe(true);
    expect(
      assessBenchmarkSchema.safeParse({
        ...base,
        requirementResults: [...base.requirementResults, base.requirementResults[0]],
      }).success,
    ).toBe(false);
    expect(
      assessBenchmarkSchema.safeParse({
        ...base,
        requirementResults: [{ ...base.requirementResults[0], evidenceKinds: [] }],
      }).success,
    ).toBe(false);
  });

  it("keeps remediation closure behind a passing locked retest", () => {
    expect(canTransitionBenchmarkRemediation("open", "in_progress")).toBe(true);
    expect(
      canTransitionBenchmarkRemediation("in_progress", "ready_for_retest"),
    ).toBe(true);
    expect(canTransitionBenchmarkRemediation("ready_for_retest", "resolved")).toBe(false);
    expect(canTransitionBenchmarkRemediation("resolved", "open")).toBe(false);
    expect(
      updateBenchmarkRemediationSchema.safeParse({ status: "ready_for_retest" }).success,
    ).toBe(true);
    expect(
      updateBenchmarkRemediationSchema.safeParse({ status: "resolved" }).success,
    ).toBe(false);
    expect(updateBenchmarkRemediationSchema.safeParse({}).success).toBe(false);
  });
});
