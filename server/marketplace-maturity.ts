import { randomBytes } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { and, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  marketplaceBundleSchema,
  marketplaceDiscountCents,
  marketplacePromotionSchema,
  marketplaceSellerProfileSchema,
  marketplaceSupportCaseSchema,
} from "@shared/marketplace-maturity";
import {
  businesses,
  entitlements,
  marketplaceBundleItems,
  marketplaceBundles,
  marketplacePolicyAcceptances,
  marketplacePromotionRedemptions,
  marketplacePromotions,
  marketplaceSellerProfiles,
  marketplaceSupportCases,
  marketplaceSupportMessages,
  orderItems,
  orders,
  products,
  users,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
const safe =
  (handler: Handler): Handler =>
  (req, res, next) => {
    try {
      Promise.resolve(handler(req, res, next)).catch(next);
    } catch (error) {
      next(error);
    }
  };
async function ownedSeller(userId: number) {
  const [seller] = await db
    .select()
    .from(marketplaceSellerProfiles)
    .where(eq(marketplaceSellerProfiles.userId, userId))
    .orderBy(desc(marketplaceSellerProfiles.updatedAt))
    .limit(1);
  return seller ?? null;
}

export async function reserveMarketplacePromotion(
  tx: any,
  input: {
    code: string;
    businessId: string | null;
    buyerUserId: number;
    orderId: string;
    productIds: number[];
    subtotalCents: number;
  },
) {
  if (!input.code) return null;
  if (!input.businessId)
    throw new Error("Promotion cannot be applied to this checkout");
  const normalizedCode = input.code.trim().toUpperCase();
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`promotion:${input.businessId}:${normalizedCode}`}))`,
  );
  const [promotion] = await tx
    .select()
    .from(marketplacePromotions)
    .where(
      and(
        eq(marketplacePromotions.businessId, input.businessId),
        eq(marketplacePromotions.code, normalizedCode),
        eq(marketplacePromotions.status, "active"),
      ),
    )
    .limit(1);
  const now = new Date();
  if (
    !promotion ||
    (promotion.startsAt && now < promotion.startsAt) ||
    (promotion.endsAt && now > promotion.endsAt)
  )
    throw new Error("Promotion is unavailable or expired");
  if (input.subtotalCents < promotion.minimumSubtotalCents)
    throw new Error("Checkout does not meet the promotion minimum");
  if (
    promotion.productIds.length > 0 &&
    input.productIds.some((id) => !promotion.productIds.includes(id))
  )
    throw new Error("Promotion does not apply to every checkout item");
  const [globalUse, buyerUse] = await Promise.all([
    tx
      .select({ value: count() })
      .from(marketplacePromotionRedemptions)
      .where(
        and(
          eq(marketplacePromotionRedemptions.promotionId, promotion.id),
          ne(marketplacePromotionRedemptions.status, "reversed"),
        ),
      ),
    tx
      .select({ value: count() })
      .from(marketplacePromotionRedemptions)
      .where(
        and(
          eq(marketplacePromotionRedemptions.promotionId, promotion.id),
          eq(marketplacePromotionRedemptions.buyerUserId, input.buyerUserId),
          ne(marketplacePromotionRedemptions.status, "reversed"),
        ),
      ),
  ]);
  if (
    promotion.maximumRedemptions > 0 &&
    Number(globalUse[0]?.value ?? 0) >= promotion.maximumRedemptions
  )
    throw new Error("Promotion redemption limit reached");
  if (Number(buyerUse[0]?.value ?? 0) >= promotion.maximumPerBuyer)
    throw new Error("Promotion buyer limit reached");
  const discountAmountCents = marketplaceDiscountCents(
    input.subtotalCents,
    promotion,
  );
  await tx.insert(marketplacePromotionRedemptions).values({
    promotionId: promotion.id,
    orderId: input.orderId,
    buyerUserId: input.buyerUserId,
    discountAmountCents,
  });
  return {
    promotion,
    discountAmountCents,
    trialDays: promotion.discountType === "trial" ? promotion.trialDays : 0,
  };
}

export async function finalizeMarketplaceOrder(orderId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(marketplacePromotionRedemptions)
      .set({ status: "redeemed", redeemedAt: new Date() })
      .where(
        and(
          eq(marketplacePromotionRedemptions.orderId, orderId),
          eq(marketplacePromotionRedemptions.status, "reserved"),
        ),
      );
    const bundleRows = await tx
      .select({ bundleId: marketplaceBundles.id })
      .from(orderItems)
      .innerJoin(
        marketplaceBundles,
        eq(marketplaceBundles.productId, orderItems.productId),
      )
      .where(eq(orderItems.orderId, orderId));
    if (!bundleRows.length) return;
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order || order.status !== "paid") return;
    const items = await tx
      .select({ productId: marketplaceBundleItems.productId })
      .from(marketplaceBundleItems)
      .where(
        inArray(
          marketplaceBundleItems.bundleId,
          bundleRows.map((row) => row.bundleId),
        ),
      );
    if (items.length)
      await tx
        .insert(entitlements)
        .values(
          items.map((item) => ({
            userId: order.buyerId,
            productId: item.productId,
            sourceOrderId: order.id,
            resourceType: "product",
            resourceId: String(item.productId),
            status: "active",
          })),
        )
        .onConflictDoNothing();
  });
}

export function registerMarketplaceMaturityRoutes(base: Express) {
  const app = {
    get: (path: string, ...handlers: Handler[]) =>
      base.get(path, ...handlers.map(safe)),
    put: (path: string, ...handlers: Handler[]) =>
      base.put(path, ...handlers.map(safe)),
    post: (path: string, ...handlers: Handler[]) =>
      base.post(path, ...handlers.map(safe)),
    patch: (path: string, ...handlers: Handler[]) =>
      base.patch(path, ...handlers.map(safe)),
  };
  app.get("/api/marketplace/operations", attachUser, async (req, res) => {
    const seller = await ownedSeller(req.dbUser!.id);
    const [promotions, bundles, cases, offers] = await Promise.all([
      seller
        ? db
            .select()
            .from(marketplacePromotions)
            .where(eq(marketplacePromotions.sellerProfileId, seller.id))
            .orderBy(desc(marketplacePromotions.createdAt))
        : [],
      seller
        ? db
            .select({ bundle: marketplaceBundles, product: products })
            .from(marketplaceBundles)
            .innerJoin(products, eq(products.id, marketplaceBundles.productId))
            .where(eq(marketplaceBundles.sellerProfileId, seller.id))
        : [],
      db
        .select()
        .from(marketplaceSupportCases)
        .where(
          or(
            eq(marketplaceSupportCases.buyerUserId, req.dbUser!.id),
            eq(marketplaceSupportCases.sellerUserId, req.dbUser!.id),
          ),
        )
        .orderBy(desc(marketplaceSupportCases.updatedAt)),
      db
        .select()
        .from(products)
        .where(eq(products.userId, req.dbUser!.id))
        .orderBy(desc(products.createdAt)),
    ]);
    return res.json({ seller, promotions, bundles, cases, offers });
  });
  app.put("/api/marketplace/seller-profile", attachUser, async (req, res) => {
    const parsed = marketplaceSellerProfileSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const now = new Date();
    const { acceptOperationalPolicy: _accepted, ...profile } = parsed.data;
    const [seller] = await db
      .insert(marketplaceSellerProfiles)
      .values({
        businessId: business.id,
        userId: req.dbUser!.id,
        ...profile,
        operationalPolicyAcceptedAt: now,
      })
      .onConflictDoUpdate({
        target: marketplaceSellerProfiles.businessId,
        set: { ...profile, operationalPolicyAcceptedAt: now, updatedAt: now },
      })
      .returning();
    await db
      .insert(marketplacePolicyAcceptances)
      .values({
        sellerProfileId: seller.id,
        userId: req.dbUser!.id,
        policyType: "marketplace_operational",
        policyVersion: profile.operationalPolicyVersion,
        evidence: { source: "authenticated_settings", accepted: true },
      })
      .onConflictDoNothing();
    return res.json(seller);
  });
  app.get("/api/public/storefronts/:slug", async (req, res) => {
    const [seller] = await db
      .select()
      .from(marketplaceSellerProfiles)
      .where(
        and(
          eq(marketplaceSellerProfiles.slug, req.params.slug),
          eq(marketplaceSellerProfiles.status, "active"),
        ),
      )
      .limit(1);
    if (!seller)
      return res.status(404).json({ message: "Storefront not found" });
    const offers = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.businessId, seller.businessId),
          eq(products.status, "published"),
        ),
      )
      .orderBy(desc(products.createdAt));
    return res.json({ seller, offers });
  });
  app.post("/api/marketplace/promotions", attachUser, async (req, res) => {
    const seller = await ownedSeller(req.dbUser!.id);
    const parsed = marketplacePromotionSchema.safeParse(req.body);
    if (!seller)
      return res
        .status(409)
        .json({ message: "Complete seller onboarding first" });
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const owned = parsed.data.productIds.length
      ? await db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              inArray(products.id, parsed.data.productIds),
              eq(products.businessId, seller.businessId),
            ),
          )
      : [];
    if (owned.length !== parsed.data.productIds.length)
      return res
        .status(403)
        .json({ message: "Promotion includes an unowned offer" });
    const [promotion] = await db
      .insert(marketplacePromotions)
      .values({
        sellerProfileId: seller.id,
        businessId: seller.businessId,
        ...parsed.data,
      })
      .returning();
    return res.status(201).json(promotion);
  });
  app.post("/api/marketplace/bundles", attachUser, async (req, res) => {
    const seller = await ownedSeller(req.dbUser!.id);
    const parsed = marketplaceBundleSchema.safeParse(req.body);
    if (!seller)
      return res
        .status(409)
        .json({ message: "Complete seller onboarding first" });
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const owned = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, parsed.data.productIds),
          eq(products.businessId, seller.businessId),
          eq(products.status, "published"),
        ),
      );
    if (owned.length !== parsed.data.productIds.length)
      return res
        .status(403)
        .json({ message: "Bundle includes an unavailable offer" });
    const { productIds, slug, priceCents, ...details } = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          userId: req.dbUser!.id,
          businessId: seller.businessId,
          payoutMode:
            process.env.CREATOROS_QUALIFICATION_MODE === "true" &&
            process.env.QUALIFICATION_ISOLATED_DATABASE === "true"
              ? "platform"
              : "creator",
          status: "published",
          productType: "bundle",
          billingModel: "one_time",
          title: details.title,
          description: details.description,
          price: priceCents / 100,
          category: "Bundle",
          imageUrl: details.imageUrl,
        })
        .returning();
      const [bundle] = await tx
        .insert(marketplaceBundles)
        .values({
          sellerProfileId: seller.id,
          businessId: seller.businessId,
          productId: product.id,
          slug,
        })
        .returning();
      await tx.insert(marketplaceBundleItems).values(
        productIds.map((productId, sortOrder) => ({
          bundleId: bundle.id,
          productId,
          sortOrder,
        })),
      );
      return { bundle, product, items: productIds };
    });
    return res.status(201).json(result);
  });
  app.post("/api/marketplace/support-cases", attachUser, async (req, res) => {
    const parsed = marketplaceSupportCaseSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, parsed.data.orderId),
          eq(orders.buyerId, req.dbUser!.id),
        ),
      )
      .limit(1);
    if (!order || order.status !== "paid")
      return res.status(404).json({ message: "Paid order not found" });
    const rows = await db
      .select({ product: products })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, order.id));
    const sellers = Array.from(new Set(rows.map((row) => row.product.userId)));
    if (sellers.length !== 1)
      return res
        .status(409)
        .json({ message: "Order support owner is ambiguous" });
    if (
      parsed.data.productId &&
      !rows.some((row) => row.product.id === parsed.data.productId)
    )
      return res.status(400).json({ message: "Product is not in this order" });
    const remainingCents = Math.round(
      Math.max(0, order.totalAmount - order.refundedAmount) * 100,
    );
    if (parsed.data.requestedRefundCents > remainingCents)
      return res
        .status(400)
        .json({ message: "Refund request exceeds order balance" });
    const [supportCase] = await db
      .insert(marketplaceSupportCases)
      .values({
        caseNumber: `COS-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`,
        buyerUserId: req.dbUser!.id,
        sellerUserId: sellers[0],
        ...parsed.data,
      })
      .returning();
    await db.insert(marketplaceSupportMessages).values({
      caseId: supportCase.id,
      authorUserId: req.dbUser!.id,
      body: parsed.data.summary,
    });
    return res.status(201).json(supportCase);
  });
  app.get(
    "/api/marketplace/support-cases/:id",
    attachUser,
    async (req, res) => {
      const [supportCase] = await db
        .select()
        .from(marketplaceSupportCases)
        .where(
          and(
            eq(marketplaceSupportCases.id, req.params.id),
            or(
              eq(marketplaceSupportCases.buyerUserId, req.dbUser!.id),
              eq(marketplaceSupportCases.sellerUserId, req.dbUser!.id),
            ),
          ),
        )
        .limit(1);
      if (!supportCase)
        return res.status(404).json({ message: "Support case not found" });
      const messages = await db
        .select({ message: marketplaceSupportMessages, author: users })
        .from(marketplaceSupportMessages)
        .innerJoin(users, eq(users.id, marketplaceSupportMessages.authorUserId))
        .where(eq(marketplaceSupportMessages.caseId, supportCase.id))
        .orderBy(marketplaceSupportMessages.createdAt);
      return res.json({
        supportCase,
        messages,
        isSeller: supportCase.sellerUserId === req.dbUser!.id,
      });
    },
  );
  app.post(
    "/api/marketplace/support-cases/:id/messages",
    attachUser,
    async (req, res) => {
      const body =
        typeof req.body?.body === "string" ? req.body.body.trim() : "";
      const [supportCase] = await db
        .select()
        .from(marketplaceSupportCases)
        .where(
          and(
            eq(marketplaceSupportCases.id, req.params.id),
            or(
              eq(marketplaceSupportCases.buyerUserId, req.dbUser!.id),
              eq(marketplaceSupportCases.sellerUserId, req.dbUser!.id),
            ),
          ),
        )
        .limit(1);
      if (!supportCase)
        return res.status(404).json({ message: "Support case not found" });
      if (!body || body.length > 5000)
        return res.status(400).json({ message: "Valid message required" });
      const [message] = await db
        .insert(marketplaceSupportMessages)
        .values({
          caseId: supportCase.id,
          authorUserId: req.dbUser!.id,
          body,
        })
        .returning();
      await db
        .update(marketplaceSupportCases)
        .set({
          status:
            req.dbUser!.id === supportCase.sellerUserId
              ? "awaiting_buyer"
              : "awaiting_seller",
          updatedAt: new Date(),
        })
        .where(eq(marketplaceSupportCases.id, supportCase.id));
      return res.status(201).json(message);
    },
  );
  app.patch(
    "/api/marketplace/support-cases/:id",
    attachUser,
    async (req, res) => {
      const [supportCase] = await db
        .select()
        .from(marketplaceSupportCases)
        .where(eq(marketplaceSupportCases.id, req.params.id))
        .limit(1);
      if (!supportCase || supportCase.sellerUserId !== req.dbUser!.id)
        return res.status(404).json({ message: "Support case not found" });
      const status = String(req.body?.status ?? "");
      if (
        !["awaiting_buyer", "refund_required", "resolved", "closed"].includes(
          status,
        )
      )
        return res.status(400).json({ message: "Invalid support status" });
      const approvedRefundCents =
        status === "refund_required"
          ? Math.min(
              supportCase.requestedRefundCents,
              Math.max(0, Number(req.body?.approvedRefundCents) || 0),
            )
          : supportCase.approvedRefundCents;
      const [updated] = await db
        .update(marketplaceSupportCases)
        .set({
          status,
          approvedRefundCents,
          providerActionStatus:
            status === "refund_required" ? "provider_pending" : "not_required",
          resolutionNote:
            typeof req.body?.resolutionNote === "string"
              ? req.body.resolutionNote.trim().slice(0, 2000)
              : supportCase.resolutionNote,
          resolvedAt: ["resolved", "closed"].includes(status)
            ? new Date()
            : null,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceSupportCases.id, supportCase.id))
        .returning();
      return res.json(updated);
    },
  );
}
