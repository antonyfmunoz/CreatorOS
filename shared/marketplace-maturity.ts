import { z } from "zod";

export const marketplaceSellerProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    headline: z.string().trim().max(240).default(""),
    bio: z.string().trim().max(5000).default(""),
    supportEmail: z.string().trim().toLowerCase().email().max(320),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#1d9bf0"),
    logoUrl: z.string().url().max(2048).nullable().default(null),
    refundPolicy: z.string().trim().min(20).max(5000),
    fulfillmentSlaHours: z.number().int().min(0).max(8760).default(24),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    taxResponsibility: z
      .enum(["seller", "platform_provider_pending"])
      .default("platform_provider_pending"),
    operationalPolicyVersion: z.string().trim().min(1).max(80),
    acceptOperationalPolicy: z.literal(true),
  })
  .strict();

export const marketplacePromotionSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/),
    discountType: z.enum(["percentage", "fixed", "trial"]),
    percentageBps: z.number().int().min(0).max(10_000).default(0),
    fixedAmountCents: z.number().int().min(0).max(100_000_000).default(0),
    trialDays: z.number().int().min(0).max(90).default(0),
    productIds: z.array(z.number().int().positive()).max(100).default([]),
    minimumSubtotalCents: z.number().int().min(0).max(100_000_000).default(0),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
    maximumRedemptions: z.number().int().min(0).max(10_000_000).default(0),
    maximumPerBuyer: z.number().int().min(1).max(100).default(1),
  })
  .strict()
  .refine(
    (value) =>
      (value.discountType === "percentage" && value.percentageBps > 0) ||
      (value.discountType === "fixed" && value.fixedAmountCents > 0) ||
      (value.discountType === "trial" && value.trialDays > 0),
    "Promotion must provide a positive discount or trial",
  )
  .refine(
    (value) =>
      !value.startsAt || !value.endsAt || value.endsAt > value.startsAt,
    { message: "Promotion must end after it starts", path: ["endsAt"] },
  );

export const marketplaceBundleSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().min(1).max(10_000),
    priceCents: z.number().int().min(0).max(100_000_000),
    imageUrl: z.string().url().max(2048).nullable().default(null),
    productIds: z.array(z.number().int().positive()).min(2).max(25),
  })
  .strict();

export const marketplaceSupportCaseSchema = z
  .object({
    orderId: z.string().uuid(),
    productId: z.number().int().positive().nullable().default(null),
    category: z.enum(["access", "billing", "refund", "content", "other"]),
    summary: z.string().trim().min(10).max(2000),
    requestedRefundCents: z.number().int().min(0).max(100_000_000).default(0),
  })
  .strict();

export function marketplaceDiscountCents(
  subtotalCents: number,
  promotion: {
    discountType: string;
    percentageBps: number;
    fixedAmountCents: number;
  },
) {
  const boundedSubtotal = Math.max(0, Math.floor(subtotalCents));
  const raw =
    promotion.discountType === "percentage"
      ? Math.floor((boundedSubtotal * promotion.percentageBps) / 10_000)
      : promotion.discountType === "fixed"
        ? promotion.fixedAmountCents
        : 0;
  return Math.min(boundedSubtotal, Math.max(0, raw));
}

export function discountedCheckoutLineAmounts(
  items: Array<{ unitAmount: number; quantity: number }>,
  discountAmount: number,
) {
  let remaining = Math.max(0, Math.round(discountAmount * 100));
  return items.map((item) => {
    const gross = Math.max(
      0,
      Math.round(item.unitAmount * 100) * item.quantity,
    );
    const applied = Math.min(gross, remaining);
    remaining -= applied;
    return gross - applied;
  });
}
