import { z } from "zod";

export const communityQuestionKinds = [
  "single_select",
  "multi_select",
  "text",
] as const;

const optionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
});

export const communityOnboardingQuestionInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    prompt: z.string().trim().min(3).max(500),
    kind: z.enum(communityQuestionKinds),
    options: z.array(optionSchema).max(20).default([]),
    required: z.boolean().default(true),
  })
  .superRefine((question, ctx) => {
    if (question.kind !== "text" && question.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Selection questions need at least two options",
      });
    }
    if (question.kind === "text" && question.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Text questions cannot have selection options",
      });
    }
    if (
      new Set(question.options.map((option) => option.id)).size !==
      question.options.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Option identifiers must be unique",
      });
    }
  });

export const replaceCommunityOnboardingSchema = z.object({
  questions: z.array(communityOnboardingQuestionInputSchema).max(12),
});

export const communityOnboardingAnswerSchema = z.object({
  questionId: z.string().uuid(),
  value: z.union([
    z.string().trim().max(2_000),
    z.array(z.string().trim().min(1).max(80)).max(20),
  ]),
});

export const completeCommunityOnboardingSchema = z.object({
  answers: z.array(communityOnboardingAnswerSchema).max(12),
});

export const communityBadgeInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(240),
  icon: z.string().trim().min(1).max(40).default("sparkles"),
  pointsThreshold: z.number().int().min(0).max(1_000_000),
});

export const replaceCommunityBadgesSchema = z.object({
  badges: z.array(communityBadgeInputSchema).max(20),
});

export const communityLevelThresholds = [
  0, 25, 75, 150, 300, 600, 1_200, 2_500,
];

export function communityLevelForPoints(points: number) {
  const safePoints = Math.max(0, Math.floor(points));
  const level = communityLevelThresholds.reduce(
    (current, threshold, index) =>
      safePoints >= threshold ? index + 1 : current,
    1,
  );
  const currentThreshold = communityLevelThresholds[level - 1] ?? 0;
  const nextThreshold = communityLevelThresholds[level] ?? null;
  return {
    level,
    currentThreshold,
    nextThreshold,
    pointsToNext:
      nextThreshold === null ? 0 : Math.max(0, nextThreshold - safePoints),
  };
}

export function validateCommunityAnswer(
  question: {
    kind: (typeof communityQuestionKinds)[number];
    options: Array<{ id: string; label: string }>;
    required: boolean;
  },
  value: string | string[] | undefined,
) {
  if (value === undefined) return !question.required;
  if (question.kind === "text") {
    return (
      typeof value === "string" &&
      (!question.required || value.trim().length > 0)
    );
  }
  const values = Array.isArray(value) ? value : [value];
  if (question.kind === "single_select" && values.length !== 1) return false;
  if (question.required && values.length === 0) return false;
  const allowed = new Set(question.options.map((option) => option.id));
  return values.every((optionId) => allowed.has(optionId));
}

export const defaultCommunityBadges = [
  {
    name: "First steps",
    description: "Joined and started participating.",
    icon: "footprints",
    pointsThreshold: 10,
  },
  {
    name: "Contributor",
    description: "Made a consistent contribution to the community.",
    icon: "sparkles",
    pointsThreshold: 100,
  },
  {
    name: "Community builder",
    description: "Helped the community sustain meaningful momentum.",
    icon: "trophy",
    pointsThreshold: 300,
  },
] as const;
