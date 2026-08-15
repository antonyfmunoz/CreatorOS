import { z } from "zod";

export const ugcCompensationModels = [
  "fixed",
  "commission",
  "hybrid",
  "gifted",
] as const;
export const ugcOpportunityStatuses = [
  "draft",
  "open",
  "paused",
  "closed",
  "completed",
  "archived",
] as const;
export const ugcApplicationStatuses = [
  "submitted",
  "shortlisted",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export const ugcCollaborationStatuses = [
  "in_progress",
  "submitted",
  "revision_requested",
  "approved",
  "live",
  "completed",
  "cancelled",
  "disputed",
] as const;
export const ugcSubmissionStatuses = [
  "submitted",
  "revision_requested",
  "approved",
  "rejected",
] as const;
export const ugcSampleShipmentStatuses = [
  "requested",
  "approved",
  "shipped",
  "delivered",
  "return_requested",
  "returned",
  "cancelled",
  "issue",
] as const;

export const ugcSampleTermsSchema = z.object({
  required: z.boolean().default(false),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        sku: z.string().trim().max(100).default(""),
        quantity: z.number().int().min(1).max(100).default(1),
      }),
    )
    .max(30)
    .default([]),
  brandPaysShipping: z.boolean().default(true),
  returnRequired: z.boolean().default(false),
  returnWindowDays: z.number().int().min(0).max(365).default(0),
  notes: z.string().trim().max(2_000).default(""),
});

export type UgcSampleTerms = z.infer<typeof ugcSampleTermsSchema>;

export const ugcSampleRequestSchema = z.object({
  recipientName: z.string().trim().min(1).max(160),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  country: z.string().trim().min(2).max(80),
  deliveryNotes: z.string().trim().max(1_000).default(""),
});

export const ugcSampleShipmentUpdateSchema = z.object({
  status: z.enum(ugcSampleShipmentStatuses),
  carrier: z.string().trim().max(100).default(""),
  trackingNumber: z.string().trim().max(200).default(""),
  note: z.string().trim().max(1_000).default(""),
});

export const ugcDeliverableSchema = z.object({
  title: z.string().trim().min(1).max(160),
  quantity: z.number().int().min(1).max(100).default(1),
  format: z.enum([
    "vertical_video",
    "landscape_video",
    "square_video",
    "photo",
    "raw_footage",
    "script",
    "other",
  ]),
  durationSeconds: z.number().int().min(1).max(3_600).optional(),
  notes: z.string().trim().max(1_000).default(""),
});

export const ugcUsageRightsSchema = z.object({
  placement: z.enum(["organic", "paid", "organic_and_paid"]),
  durationDays: z.number().int().min(1).max(3_650),
  territories: z
    .array(z.string().trim().min(1).max(80))
    .max(50)
    .default(["Worldwide"]),
  allowDerivativeEdits: z.boolean().default(false),
  includeRawFootage: z.boolean().default(false),
  includeLikeness: z.boolean().default(true),
  includeVoice: z.boolean().default(true),
  exclusivityDays: z.number().int().min(0).max(365).default(0),
});

export const ugcEligibilitySchema = z.object({
  countries: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  minimumAge: z.number().int().min(18).max(100).default(18),
  niches: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  requiresPortfolio: z.boolean().default(true),
  notes: z.string().trim().max(1_000).default(""),
});

export type UgcUsageRights = z.infer<typeof ugcUsageRightsSchema>;
export type UgcEligibility = z.infer<typeof ugcEligibilitySchema>;

export const ugcCreatorProfileInputSchema = z.object({
  headline: z.string().trim().max(160).default(""),
  bio: z.string().trim().max(2_000).default(""),
  niches: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  languages: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  startingRateCents: z.number().int().min(0).max(100_000_000).default(0),
  currency: z
    .string()
    .trim()
    .regex(/^[a-zA-Z]{3}$/)
    .transform((value) => value.toLowerCase())
    .default("usd"),
  availability: z
    .enum(["available", "limited", "unavailable"])
    .default("available"),
  portfolioPublic: z.boolean().default(true),
});

export const ugcPortfolioInputSchema = z.object({
  assetId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).default(""),
  category: z.string().trim().min(1).max(80),
  format: z.enum([
    "vertical_video",
    "landscape_video",
    "square_video",
    "photo",
    "audio",
    "other",
  ]),
  public: z.boolean().default(true),
  performance: z
    .object({
      impressions: z.number().int().min(0).max(2_000_000_000).default(0),
      conversions: z.number().int().min(0).max(2_000_000_000).default(0),
      attributedRevenueCents: z
        .number()
        .int()
        .min(0)
        .max(2_000_000_000)
        .default(0),
    })
    .default({}),
});

export const ugcOpportunityInputSchema = z.object({
  businessId: z.string().uuid().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(10_000),
  category: z.string().trim().min(1).max(80),
  platforms: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  deliverables: z.array(ugcDeliverableSchema).min(1).max(30),
  compensationModel: z.enum(ugcCompensationModels),
  fixedFeeCents: z.number().int().min(0).max(100_000_000).default(0),
  commissionBps: z.number().int().min(0).max(10_000).default(0),
  currency: z
    .string()
    .trim()
    .regex(/^[a-zA-Z]{3}$/)
    .transform((value) => value.toLowerCase())
    .default("usd"),
  applicationDeadline: z.coerce.date().nullable().optional(),
  contentDueAt: z.coerce.date().nullable().optional(),
  usageRights: ugcUsageRightsSchema,
  eligibility: ugcEligibilitySchema.default({}),
  revisionLimit: z.number().int().min(0).max(20).default(2),
  disclosure: z
    .string()
    .trim()
    .max(2_000)
    .default("Paid partnership disclosure required where applicable."),
  sampleTerms: ugcSampleTermsSchema.default({}),
});

const sampleShipmentTransitions: Record<string, readonly string[]> = {
  requested: ["approved", "cancelled", "issue"],
  approved: ["shipped", "cancelled", "issue"],
  shipped: ["delivered", "issue"],
  delivered: ["return_requested", "issue"],
  return_requested: ["returned", "issue"],
  issue: ["approved", "shipped", "delivered", "cancelled"],
  returned: [],
  cancelled: [],
};

export function canTransitionUgcSampleShipment(from: string, to: string) {
  return Boolean(sampleShipmentTransitions[from]?.includes(to));
}

export const ugcApplicationInputSchema = z.object({
  pitch: z.string().trim().min(1).max(5_000),
  portfolioItemIds: z.array(z.string().uuid()).max(12).default([]),
  previewAssetId: z.string().uuid().nullable().optional(),
  proposedFeeCents: z
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .nullable()
    .optional(),
});

export const ugcSubmissionInputSchema = z.object({
  assetId: z.string().uuid(),
  caption: z.string().trim().max(5_000).default(""),
  notes: z.string().trim().max(5_000).default(""),
});

export const ugcPerformanceInputSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  source: z.string().trim().min(1).max(80).default("manual"),
  impressions: z.number().int().min(0).max(2_000_000_000).default(0),
  engagements: z.number().int().min(0).max(2_000_000_000).default(0),
  clicks: z.number().int().min(0).max(2_000_000_000).default(0),
  conversions: z.number().int().min(0).max(2_000_000_000).default(0),
  spendCents: z.number().int().min(0).max(2_000_000_000).default(0),
  attributedRevenueCents: z.number().int().min(0).max(2_000_000_000).default(0),
  capturedAt: z.coerce.date().optional(),
});

export function validateUgcCompensation(input: {
  compensationModel: (typeof ugcCompensationModels)[number];
  fixedFeeCents: number;
  commissionBps: number;
}) {
  if (
    ["fixed", "hybrid"].includes(input.compensationModel) &&
    input.fixedFeeCents <= 0
  )
    throw new Error("Fixed and hybrid opportunities require a fixed fee");
  if (
    ["commission", "hybrid"].includes(input.compensationModel) &&
    input.commissionBps <= 0
  )
    throw new Error(
      "Commission and hybrid opportunities require a commission rate",
    );
  if (
    input.compensationModel === "gifted" &&
    (input.fixedFeeCents > 0 || input.commissionBps > 0)
  )
    throw new Error("Gifted opportunities cannot promise cash compensation");
}

const applicationTransitions: Record<string, readonly string[]> = {
  submitted: ["shortlisted", "accepted", "rejected", "withdrawn"],
  shortlisted: ["accepted", "rejected", "withdrawn"],
  accepted: [],
  rejected: [],
  withdrawn: [],
};

const collaborationTransitions: Record<string, readonly string[]> = {
  in_progress: ["submitted", "cancelled", "disputed"],
  submitted: ["revision_requested", "approved", "disputed"],
  revision_requested: ["submitted", "cancelled", "disputed"],
  approved: ["live", "completed", "disputed"],
  live: ["completed", "disputed"],
  completed: [],
  cancelled: [],
  disputed: ["in_progress", "cancelled", "completed"],
};

export function canTransitionUgcApplication(from: string, to: string) {
  return Boolean(applicationTransitions[from]?.includes(to));
}

export function canTransitionUgcCollaboration(from: string, to: string) {
  return Boolean(collaborationTransitions[from]?.includes(to));
}

export function ugcCommissionAmount(
  attributedRevenueCents: number,
  commissionBps: number,
) {
  return Math.round((attributedRevenueCents * commissionBps) / 10_000);
}

export function ugcEarningsSummary(
  entries: Array<{ amountCents: number; status: string }>,
) {
  return entries.reduce(
    (summary, entry) => {
      summary.totalCents += entry.amountCents;
      if (entry.status === "paid") summary.paidCents += entry.amountCents;
      else if (entry.status === "approved")
        summary.approvedCents += entry.amountCents;
      else summary.pendingCents += entry.amountCents;
      return summary;
    },
    { totalCents: 0, pendingCents: 0, approvedCents: 0, paidCents: 0 },
  );
}
