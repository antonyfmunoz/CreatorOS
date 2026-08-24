import { z } from "zod";

export const benchmarkFamilies = [
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
] as const;

const sourceReferenceSchema = z.object({
  label: z.string().trim().min(1).max(160),
  url: z.string().url().max(2_000),
  checkedAt: z.coerce.date(),
});

export const createBenchmarkDefinitionSchema = z.object({
  family: z.enum(benchmarkFamilies),
  name: z.string().trim().min(4).max(200),
  targetUser: z.string().trim().min(4).max(500),
  workflow: z.string().trim().min(20).max(8_000),
  comparisonProducts: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
  outputSpecification: z.record(z.unknown()).default({}),
  rubric: z.record(z.unknown()).default({}),
  sourceReferences: z.array(sourceReferenceSchema).min(1).max(40),
});

export const benchmarkEnvironmentSchema = z.object({
  protocolVersion: z.string().trim().min(1).max(40),
  sourceManifestId: z.string().trim().min(3).max(240),
  deviceClass: z.string().trim().min(2).max(120),
  networkClass: z.string().trim().min(2).max(120),
  operatorSkillLevel: z.enum(["novice", "trained", "expert"]),
  locale: z.string().trim().min(2).max(40),
});

export const startBenchmarkRunSchema = z
  .object({
    implementation: z.enum(["creativesos", "comparison"]),
    comparisonProduct: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .nullable()
      .default(null),
    environment: benchmarkEnvironmentSchema,
  })
  .superRefine((value, ctx) => {
    if (value.implementation === "comparison" && !value.comparisonProduct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comparisonProduct"],
        message: "A named comparison product is required",
      });
    }
    if (value.implementation === "creativesos" && value.comparisonProduct) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comparisonProduct"],
        message: "CreativesOS runs cannot name a comparison product",
      });
    }
  });

const boundedCount = z.number().int().min(0).max(1_000_000);
const boundedTime = z
  .number()
  .int()
  .min(1)
  .max(30 * 24 * 60 * 60 * 1_000);
const score = z.number().min(0).max(5);

export const requiredBenchmarkEvidenceKinds = [
  "input_manifest",
  "action_log",
  "output_artifact",
  "run_recording",
] as const;

const benchmarkEvidenceSchema = z.object({
  kind: z.enum(requiredBenchmarkEvidenceKinds),
  uri: z.string().trim().min(1).max(2_000),
  checksum: z.string().trim().min(8).max(200),
});

export const completeBenchmarkRunSchema = z
  .object({
    status: z.enum(["completed", "failed", "invalid"]),
    activeTimeMs: boundedTime,
    elapsedTimeMs: boundedTime,
    applicationCount: boundedCount,
    exportCount: boundedCount,
    uploadCount: boundedCount,
    manualHandoffCount: boundedCount,
    actionCount: boundedCount,
    retryCount: boundedCount,
    failureCount: boundedCount,
    unrecoverableErrorCount: boundedCount,
    outputQualityScore: score,
    safetyScore: score,
    reliabilityScore: score,
    accessibilityScore: score,
    notes: z.string().trim().min(20).max(8_000),
    evidence: z.array(benchmarkEvidenceSchema).min(4).max(100),
  })
  .superRefine((value, ctx) => {
    for (const kind of requiredBenchmarkEvidenceKinds) {
      if (!value.evidence.some((item) => item.kind === kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidence"],
          message: `Evidence must include ${kind}`,
        });
      }
    }
  });

export const assessBenchmarkSchema = z.object({
  creativesOsRunId: z.string().uuid(),
  comparisonRunId: z.string().uuid(),
  qualityComparable: z.boolean(),
  reviewerNote: z.string().trim().min(40).max(8_000),
});

export function benchmarkReductionBps(
  baseline: number,
  candidate: number,
): number {
  if (baseline <= 0) return candidate <= 0 ? 0 : -10_000;
  return Math.round(((baseline - candidate) / baseline) * 10_000);
}

export function competitiveState(input: {
  qualityComparable: boolean;
  nativeScores: number[];
  comparisonScores: number[];
  activeTimeReductionBps: number;
  handoffReductionBps: number;
  nativeUnrecoverableErrors: number;
}): "parity_failed" | "parity_met" | "connected_advantage_proven" {
  const noMaterialQualityLoss = input.nativeScores.every(
    (scoreValue, index) =>
      scoreValue >= (input.comparisonScores[index] ?? 5) - 0.5,
  );
  if (
    !input.qualityComparable ||
    !noMaterialQualityLoss ||
    input.nativeUnrecoverableErrors > 0
  ) {
    return "parity_failed";
  }
  if (
    input.activeTimeReductionBps >= 2_500 ||
    input.handoffReductionBps >= 5_000
  ) {
    return "connected_advantage_proven";
  }
  return "parity_met";
}
