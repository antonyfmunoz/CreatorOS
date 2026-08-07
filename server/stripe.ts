import Stripe from "stripe";
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { creatorEarningsAllocations, creatorPaymentAccounts, orderItems, orders, products } from "../shared/schema";
import { db } from "./db";
import { attachUser } from "./auth";
import { settleOrder } from "./commerce";
import { calculateCreatorAllocation, cents, platformFeeBps } from "../shared/creator-payouts";

const PAYMENT_PROVIDER = "stripe";
type CreatorCheckoutRoute = {
  sellerUserId: number;
  connectedAccountId: string;
  grossAmount: number;
  platformFeeAmount: number;
  creatorNetAmount: number;
  applicationFeeCents: number;
};

function configuredValue(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET") {
  const value = process.env[name]?.trim();
  return value || null;
}

export function isStripeConfigured() {
  return Boolean(configuredValue("STRIPE_SECRET_KEY"));
}

export function isStripeConnectConfigured() {
  // Standard Connect Onboarding uses the platform secret key and an Account
  // Link. An OAuth client ID is only needed for a future, optional existing-
  // account connection flow.
  return isStripeConfigured();
}

function getStripe() {
  const secretKey = configuredValue("STRIPE_SECRET_KEY");
  if (!secretKey) throw new Error("Stripe is not configured");
  return new Stripe(secretKey);
}

function appUrl() {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (!configured) throw new Error("PUBLIC_APP_URL is not configured");
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("PUBLIC_APP_URL must use HTTPS outside local development");
  }
  return url.origin;
}

async function getBuyerOrder(orderId: string, buyerId: number) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId))).limit(1);
  return order;
}

function paymentAccountStatus(account: Stripe.Account) {
  return account.charges_enabled && account.payouts_enabled ? "enabled" : "pending";
}

async function synchronizeCreatorPaymentAccount(account: typeof creatorPaymentAccounts.$inferSelect) {
  const stripeAccount = await getStripe().accounts.retrieve(account.stripeAccountId);
  const status = paymentAccountStatus(stripeAccount);
  const [updated] = await db.update(creatorPaymentAccounts).set({
    status,
    detailsSubmitted: stripeAccount.details_submitted,
    chargesEnabled: stripeAccount.charges_enabled,
    payoutsEnabled: stripeAccount.payouts_enabled,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(creatorPaymentAccounts.id, account.id)).returning();
  return updated ?? account;
}

async function creatorCheckoutRoute(orderId: string): Promise<CreatorCheckoutRoute | null> {
  const items = await db.select({ item: orderItems, product: products })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
  const creatorOffers = items.filter(({ product }) => product.payoutMode === "creator");
  if (!creatorOffers.length) return null;

  const sellerUserId = creatorOffers[0].product.userId;
  if (creatorOffers.length !== items.length || creatorOffers.some(({ product }) => product.userId !== sellerUserId)) {
    throw new Error("Creator checkout supports one creator's offers per order");
  }

  const [savedAccount] = await db.select().from(creatorPaymentAccounts)
    .where(eq(creatorPaymentAccounts.userId, sellerUserId)).limit(1);
  if (!savedAccount) throw new Error("This creator has not connected a payout account");
  if (savedAccount.accountType !== "standard") {
    throw new Error("This creator must reconnect their own Stripe account before accepting payouts");
  }
  const account = await synchronizeCreatorPaymentAccount(savedAccount);
  if (!account.chargesEnabled || !account.payoutsEnabled) {
    throw new Error("This creator's payout account is not ready to accept payments");
  }

  const grossAmount = items.reduce((total, { item }) => total + item.unitAmount * item.quantity, 0);
  const allocation = calculateCreatorAllocation(grossAmount);
  return {
    sellerUserId,
    connectedAccountId: account.stripeAccountId,
    ...allocation,
  };
}

async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) throw new Error("Stripe Checkout session is missing an order reference");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Stripe Checkout session references an unknown order");
  if (order.paymentProvider !== PAYMENT_PROVIDER || order.providerReference !== session.id) {
    throw new Error("Stripe Checkout session does not match the prepared order");
  }
  if (session.currency !== order.currency || session.amount_total !== cents(order.totalAmount)) {
    throw new Error("Stripe Checkout payment amount does not match the prepared order");
  }
  const paymentIntentReference = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  return settleOrder({ orderId: order.id, paymentProvider: PAYMENT_PROVIDER, providerReference: session.id, creatorPaymentIntentReference: paymentIntentReference ?? undefined });
}

/**
 * Stripe requires the exact incoming bytes for webhook verification. The
 * application's JSON middleware captures those bytes in req.rawBody before it
 * parses the request, so this route must remain registered before any handler
 * that could rely on the parsed body.
 */
export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const webhookSecret = configuredValue("STRIPE_WEBHOOK_SECRET");
    if (!isStripeConfigured() || !webhookSecret) {
      return res.status(503).json({ message: "Stripe webhook is not configured" });
    }

    const signature = req.header("stripe-signature");
    if (!signature || !req.rawBody) {
      return res.status(400).json({ message: "Missing Stripe signature" });
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.rawBody, signature, webhookSecret);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid Stripe webhook";
      return res.status(400).json({ message: detail });
    }

    try {
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object as Stripe.Checkout.Session;
        // Delayed payment methods send async_payment_succeeded later. Never
        // grant access until Stripe reports the session as paid.
        if (session.payment_status === "paid") await fulfillCheckoutSession(session);
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Stripe fulfillment failed:", error);
      // A 5xx asks Stripe to retry a verified event. Settlement is idempotent.
      return res.status(500).json({ message: "Unable to fulfill Stripe payment" });
    }
  });
}

export function registerStripeRoutes(app: Express) {
  app.get("/api/payments/stripe/status", (_req, res) => {
    res.json({ configured: isStripeConfigured(), connectConfigured: isStripeConnectConfigured() });
  });

  app.get("/api/creator-payments/account", attachUser, async (req, res) => {
    const [account] = await db.select().from(creatorPaymentAccounts)
      .where(eq(creatorPaymentAccounts.userId, req.dbUser!.id)).limit(1);
    if (!account) return res.json({ connected: false, connectConfigured: isStripeConnectConfigured(), platformFeeBps: platformFeeBps() });
    res.json({
      connected: true,
      accountId: account.stripeAccountId,
      accountType: account.accountType,
      status: account.status,
      detailsSubmitted: account.detailsSubmitted,
      chargesEnabled: account.chargesEnabled,
      payoutsEnabled: account.payoutsEnabled,
      platformFeeBps: platformFeeBps(),
      connectConfigured: isStripeConnectConfigured(),
      lastSyncedAt: account.lastSyncedAt,
    });
  });

  app.post("/api/creator-payments/account/refresh", attachUser, async (req, res) => {
    if (!isStripeConfigured()) return res.status(503).json({ message: "Stripe Connect is not configured yet" });
    try {
      const [account] = await db.select().from(creatorPaymentAccounts)
        .where(eq(creatorPaymentAccounts.userId, req.dbUser!.id)).limit(1);
      if (!account) return res.status(404).json({ message: "No payout account is connected" });
      const refreshed = await synchronizeCreatorPaymentAccount(account);
      res.json({ connected: true, accountType: refreshed.accountType, status: refreshed.status, detailsSubmitted: refreshed.detailsSubmitted, chargesEnabled: refreshed.chargesEnabled, payoutsEnabled: refreshed.payoutsEnabled, platformFeeBps: platformFeeBps(), lastSyncedAt: refreshed.lastSyncedAt });
    } catch (error) {
      console.error("Unable to refresh creator Stripe account:", error);
      res.status(502).json({ message: "Unable to refresh payout account status" });
    }
  });

  app.post("/api/creator-payments/onboarding", attachUser, async (req, res) => {
    if (!isStripeConfigured()) return res.status(503).json({ message: "Stripe Connect is not configured yet" });
    try {
      const [existing] = await db.select().from(creatorPaymentAccounts)
        .where(eq(creatorPaymentAccounts.userId, req.dbUser!.id)).limit(1);
      let paymentAccount = existing;
      if (!paymentAccount) {
        // Stripe's supported path for a new marketplace creator: a Standard
        // account retains its own Stripe Dashboard and banking relationship.
        const stripeAccount = await getStripe().accounts.create({ type: "standard" });
        const [created] = await db.insert(creatorPaymentAccounts).values({
          userId: req.dbUser!.id,
          stripeAccountId: stripeAccount.id,
          accountType: "standard",
          status: paymentAccountStatus(stripeAccount),
          detailsSubmitted: stripeAccount.details_submitted,
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          lastSyncedAt: new Date(),
        }).onConflictDoNothing().returning();
        paymentAccount = created ?? (await db.select().from(creatorPaymentAccounts)
          .where(eq(creatorPaymentAccounts.userId, req.dbUser!.id)).limit(1))[0];
      }
      if (!paymentAccount) throw new Error("Unable to create a creator payout account");
      const accountLink = await getStripe().accountLinks.create({
        account: paymentAccount.stripeAccountId,
        refresh_url: `${appUrl()}/earnings?stripe=refresh`,
        return_url: `${appUrl()}/earnings?stripe=return`,
        type: "account_onboarding",
      });
      res.json({ onboardingUrl: accountLink.url });
    } catch (error) {
      console.error("Unable to start creator Stripe connection:", error);
      res.status(502).json({ message: "Unable to start Stripe account connection" });
    }
  });

  app.get("/api/creator-payments/earnings", attachUser, async (req, res) => {
    const allocations = await db.select().from(creatorEarningsAllocations)
      .where(eq(creatorEarningsAllocations.sellerUserId, req.dbUser!.id))
      .orderBy(desc(creatorEarningsAllocations.createdAt));
    const totals = allocations.reduce((result, allocation) => {
      result.grossAmount += allocation.grossAmount;
      result.platformFeeAmount += allocation.platformFeeAmount;
      result.creatorNetAmount += allocation.creatorNetAmount;
      if (allocation.status === "paid") result.paidAmount += allocation.creatorNetAmount;
      return result;
    }, { grossAmount: 0, platformFeeAmount: 0, creatorNetAmount: 0, paidAmount: 0 });
    res.json({ allocations, totals, platformFeeBps: platformFeeBps() });
  });

  app.post("/api/orders/:id/checkout", attachUser, async (req, res) => {
    if (process.env.CREATOROS_DEMO_MODE === "true") {
      return res.status(501).json({ message: "Stripe Checkout is unavailable in demo mode" });
    }
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Secure checkout is not configured yet" });
    }

    try {
      const order = await getBuyerOrder(req.params.id, req.dbUser!.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status === "paid") return res.status(409).json({ message: "This order has already been paid" });
      if (order.status !== "payment_required") return res.status(409).json({ message: "This order is not ready for payment" });
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      if (!items.length) return res.status(409).json({ message: "This order has no items" });

      const creatorRoute = await creatorCheckoutRoute(order.id);

      const origin = appUrl();
      const paymentIntentData: Stripe.Checkout.SessionCreateParams.PaymentIntentData = {
        metadata: { orderId: order.id, buyerId: String(order.buyerId) },
      };
      if (creatorRoute) {
        paymentIntentData.transfer_data = { destination: creatorRoute.connectedAccountId };
        paymentIntentData.transfer_group = order.id;
        if (creatorRoute.applicationFeeCents > 0) {
          paymentIntentData.application_fee_amount = creatorRoute.applicationFeeCents;
        }
      }
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        // Managed Payments requires product tax codes and changes Stripe's
        // merchant-of-record behavior. Keep it off until the tax/provider
        // phase is deliberately implemented for marketplace offers.
        managed_payments: { enabled: false },
        client_reference_id: order.id,
        success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/cart?checkout=cancelled`,
        metadata: { orderId: order.id, buyerId: String(order.buyerId) },
        payment_intent_data: paymentIntentData,
        line_items: items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: order.currency,
            unit_amount: cents(item.unitAmount),
            product_data: { name: item.titleSnapshot },
          },
        })),
      });
      if (!session.url) throw new Error("Stripe did not return a Checkout URL");

      await db.transaction(async (tx) => {
        await tx.update(orders).set({
          paymentProvider: PAYMENT_PROVIDER,
          providerReference: session.id,
          updatedAt: new Date(),
        }).where(and(eq(orders.id, order.id), eq(orders.status, "payment_required")));
        if (creatorRoute) {
          await tx.insert(creatorEarningsAllocations).values({
            orderId: order.id,
            sellerUserId: creatorRoute.sellerUserId,
            stripeConnectedAccountId: creatorRoute.connectedAccountId,
            currency: order.currency,
            grossAmount: creatorRoute.grossAmount,
            platformFeeAmount: creatorRoute.platformFeeAmount,
            creatorNetAmount: creatorRoute.creatorNetAmount,
            status: "payment_required",
          }).onConflictDoNothing();
        }
      });
      res.json({ orderId: order.id, checkoutUrl: session.url });
    } catch (error) {
      console.error("Unable to create Stripe Checkout session:", error);
      const message = error instanceof Error && error.message.includes("creator")
        ? error.message
        : "Unable to start secure checkout. Please try again.";
      res.status(502).json({ message });
    }
  });

  app.get("/api/checkout/sessions/:sessionId", attachUser, async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!sessionId || sessionId.length > 255) return res.status(400).json({ message: "Invalid Checkout session" });
    const [order] = await db.select().from(orders).where(and(
      eq(orders.buyerId, req.dbUser!.id),
      eq(orders.paymentProvider, PAYMENT_PROVIDER),
      eq(orders.providerReference, sessionId),
    )).limit(1);
    if (!order) return res.status(404).json({ message: "Checkout session not found" });
    res.json({ orderId: order.id, status: order.status, totalAmount: order.totalAmount, currency: order.currency });
  });
}
