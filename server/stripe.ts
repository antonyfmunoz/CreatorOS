import Stripe from "stripe";
import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { commerceProviderEvents, communityMemberships, creatorEarningsAllocations, creatorPaymentAccounts, creatorPayoutEvents, entitlements, orderItems, orders, products } from "../shared/schema";
import { db } from "./db";
import { attachUser } from "./auth";
import { settleOrder } from "./commerce";
import { calculateCreatorAllocation, cents, platformFeeBps } from "../shared/creator-payouts";
import { checkoutBillingTerms } from "../shared/product-catalog";
import { subscriptionAccessEndsAt, subscriptionCanCancel, subscriptionGrantsAccess, subscriptionTransitionAllowed } from "../shared/subscription-policy";
import { allocationReversalAmount, disputedOrderState, refundedOrderState } from "../shared/commerce-financial-policy";

const PAYMENT_PROVIDER = "stripe";
type CreatorCheckoutRoute = {
  sellerUserId: number;
  connectedAccountId: string;
  grossAmount: number;
  platformFeeAmount: number;
  creatorNetAmount: number;
  applicationFeeCents: number;
};

function configuredValue(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET" | "STRIPE_CONNECT_WEBHOOK_SECRET") {
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

async function userCanRefundOrder(orderId: string, userId: number, isAdministrator: boolean) {
  if (isAdministrator) return true;
  const items = await db.select({ sellerUserId: products.userId })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
  return items.length > 0 && items.every((item) => item.sellerUserId === userId);
}

async function refundPaymentReference(order: typeof orders.$inferSelect) {
  if (order.providerPaymentReference?.startsWith("pi_")) return order.providerPaymentReference;
  // Orders created before the durable financial-lifecycle migration only
  // retained their Checkout Session. Resolve its verified PaymentIntent so
  // those legitimate historical sales remain refundable.
  if (order.providerReference?.startsWith("cs_")) {
    const session = await getStripe().checkout.sessions.retrieve(order.providerReference, {
      expand: ["payment_intent"],
    });
    const paymentIntent = session.payment_intent;
    const paymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
    if (paymentIntentId?.startsWith("pi_")) return paymentIntentId;
  }
  if (!order.providerSubscriptionReference) return order.providerPaymentReference;
  const subscription = await getStripe().subscriptions.retrieve(order.providerSubscriptionReference, {
    expand: ["latest_invoice", "latest_invoice.payments"],
  });
  if (!subscription.latest_invoice) return null;
  const invoice = typeof subscription.latest_invoice === "string"
    ? await getStripe().invoices.retrieve(subscription.latest_invoice, { expand: ["payments"] })
    : subscription.latest_invoice;
  return invoicePaymentReference(invoice);
}

function paymentAccountStatus(account: Stripe.Account) {
  return account.charges_enabled && account.payouts_enabled ? "enabled" : "pending";
}

function paymentAccountFields(account: Stripe.Account) {
  return {
    status: paymentAccountStatus(account),
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    disabledReason: account.requirements?.disabled_reason ?? null,
    requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
    requirementsPastDue: account.requirements?.past_due ?? [],
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  };
}

async function synchronizeCreatorPaymentAccount(account: typeof creatorPaymentAccounts.$inferSelect) {
  const stripeAccount = await getStripe().accounts.retrieve(account.stripeAccountId);
  const [updated] = await db.update(creatorPaymentAccounts).set(paymentAccountFields(stripeAccount))
    .where(eq(creatorPaymentAccounts.id, account.id)).returning();
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
  const subscriptionReference = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (subscriptionReference) {
    await db.update(orders).set({
      providerPaymentReference: paymentIntentReference ?? null,
      providerSubscriptionReference: subscriptionReference,
      subscriptionStatus: "active",
      financialStatus: "paid",
      lastProviderEventAt: new Date(),
      updatedAt: new Date(),
    })
      .where(eq(orders.id, order.id));
  }
  return settleOrder({
    orderId: order.id,
    paymentProvider: PAYMENT_PROVIDER,
    providerReference: session.id,
    creatorPaymentIntentReference: paymentIntentReference ?? subscriptionReference ?? undefined,
  });
}

async function synchronizeSubscriptionAccess(subscription: Stripe.Subscription) {
  const orderId = subscription.metadata?.orderId;
  if (!orderId) return;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Stripe subscription references an unknown order");
  if (order.providerSubscriptionReference && order.providerSubscriptionReference !== subscription.id) {
    throw new Error("Stripe subscription does not match the prepared order");
  }
  if (!subscriptionTransitionAllowed(order.subscriptionStatus, subscription.status)) return;
  const active = subscriptionGrantsAccess(subscription.status);
  const cancelAt = subscriptionAccessEndsAt({
    cancelAt: subscription.cancel_at,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    itemPeriodEnds: subscription.items.data.map((item) => item.current_period_end),
  });
  await db.transaction(async (tx) => {
    await tx.update(orders).set({
      providerSubscriptionReference: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionCancelAt: cancelAt,
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    })
      .where(eq(orders.id, order.id));
    await tx.update(entitlements).set({
      status: active ? "active" : "revoked",
      endsAt: active ? null : new Date(),
      updatedAt: new Date(),
    }).where(eq(entitlements.sourceOrderId, order.id));
    if (!active) {
      const linkedCommunities = await tx.selectDistinct({ communityId: products.communityId })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(
          eq(orderItems.orderId, order.id),
          isNotNull(products.communityId),
        ));
      for (const { communityId } of linkedCommunities) {
        if (communityId === null) continue;
        const [otherActiveAccess] = await tx.select({ id: entitlements.id })
          .from(entitlements)
          .innerJoin(products, eq(entitlements.productId, products.id))
          .where(and(
            eq(entitlements.userId, order.buyerId),
            eq(entitlements.status, "active"),
            eq(products.communityId, communityId),
          ))
          .limit(1);
        if (!otherActiveAccess) {
          await tx.delete(communityMemberships).where(and(
            eq(communityMemberships.userId, order.buyerId),
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.role, "member"),
            eq(communityMemberships.status, "active"),
          ));
        }
      }
    }
    if (!active) {
      await tx.update(creatorEarningsAllocations).set({ status: "canceled", updatedAt: new Date() })
        .where(and(
          eq(creatorEarningsAllocations.orderId, order.id),
          eq(creatorEarningsAllocations.status, "payment_required"),
        ));
    }
  });
}

function invoiceSubscriptionReference(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id ?? null;
}

function invoicePaymentReference(invoice: Stripe.Invoice) {
  const legacy = (invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }).payment_intent;
  if (typeof legacy === "string") return legacy;
  if (legacy?.id) return legacy.id;
  const payments = (invoice as Stripe.Invoice & {
    payments?: { data?: Array<{ payment?: { payment_intent?: string | Stripe.PaymentIntent | null } }> };
  }).payments?.data ?? [];
  for (const entry of payments) {
    const reference = entry.payment?.payment_intent;
    if (typeof reference === "string") return reference;
    if (reference?.id) return reference.id;
  }
  return null;
}

async function recordPaidSubscriptionInvoice(invoice: Stripe.Invoice) {
  const subscriptionReference = invoiceSubscriptionReference(invoice);
  if (!subscriptionReference || invoice.amount_paid <= 0) return;
  const [order] = await db.select().from(orders)
    .where(eq(orders.providerSubscriptionReference, subscriptionReference))
    .limit(1);
  if (!order) return;

  const paymentReference = invoicePaymentReference(invoice);
  if (paymentReference) {
    await db.update(orders).set({
      providerPaymentReference: paymentReference,
      financialStatus: "paid",
      lastProviderEventAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
  }

  await db.transaction(async (tx) => {
    if (subscriptionGrantsAccess(order.subscriptionStatus ?? "")) {
      await tx.update(entitlements).set({ status: "active", endsAt: null, updatedAt: new Date() })
        .where(eq(entitlements.sourceOrderId, order.id));
    }
    const [template] = await tx.select().from(creatorEarningsAllocations)
      .where(eq(creatorEarningsAllocations.orderId, order.id))
      .orderBy(creatorEarningsAllocations.createdAt)
      .limit(1);
    if (!template) return;

    const allocation = calculateCreatorAllocation(invoice.amount_paid / 100);
    const [initial] = await tx.select().from(creatorEarningsAllocations)
      .where(and(
        eq(creatorEarningsAllocations.orderId, order.id),
        isNull(creatorEarningsAllocations.providerEventReference),
      ))
      .limit(1);
    if (initial) {
      await tx.update(creatorEarningsAllocations).set({
        currency: invoice.currency,
        grossAmount: allocation.grossAmount,
        platformFeeAmount: allocation.platformFeeAmount,
        creatorNetAmount: allocation.creatorNetAmount,
        paymentIntentReference: invoice.id,
        providerEventReference: invoice.id,
        status: "paid",
        updatedAt: new Date(),
      }).where(eq(creatorEarningsAllocations.id, initial.id));
      return;
    }
    await tx.insert(creatorEarningsAllocations).values({
      orderId: order.id,
      sellerUserId: template.sellerUserId,
      stripeConnectedAccountId: template.stripeConnectedAccountId,
      currency: invoice.currency,
      grossAmount: allocation.grossAmount,
      platformFeeAmount: allocation.platformFeeAmount,
      creatorNetAmount: allocation.creatorNetAmount,
      paymentIntentReference: invoice.id,
      providerEventReference: invoice.id,
      status: "paid",
    }).onConflictDoNothing();
  });
}

type CommerceEventOutcome = {
  status?: "processed" | "ignored";
  orderId?: string | null;
  providerObjectReference?: string | null;
  connectedAccountId?: string | null;
  amount?: number | null;
  currency?: string | null;
};

async function beginCommerceProviderEvent(event: Stripe.Event, payloadSha256: string) {
  const providerObjectReference = typeof event.data.object === "object" && event.data.object && "id" in event.data.object
    ? String(event.data.object.id)
    : null;
  const [created] = await db.insert(commerceProviderEvents).values({
    provider: PAYMENT_PROVIDER,
    providerEventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    connectedAccountId: event.account ?? null,
    providerObjectReference,
    payloadSha256,
  }).onConflictDoNothing().returning();
  if (created) return { eventRow: created, shouldProcess: true };

  const [existing] = await db.select().from(commerceProviderEvents)
    .where(and(eq(commerceProviderEvents.provider, PAYMENT_PROVIDER), eq(commerceProviderEvents.providerEventId, event.id)))
    .limit(1);
  if (!existing) throw new Error("Commerce provider event idempotency state is unavailable");
  if (existing.status !== "failed") return { eventRow: existing, shouldProcess: false };
  const [retrying] = await db.update(commerceProviderEvents).set({
    status: "processing",
    errorCode: null,
    errorMessage: null,
    updatedAt: new Date(),
  }).where(and(eq(commerceProviderEvents.id, existing.id), eq(commerceProviderEvents.status, "failed"))).returning();
  return { eventRow: retrying ?? existing, shouldProcess: Boolean(retrying) };
}

async function finishCommerceProviderEvent(eventRowId: string, outcome: CommerceEventOutcome) {
  await db.update(commerceProviderEvents).set({
    status: outcome.status ?? "processed",
    orderId: outcome.orderId ?? null,
    providerObjectReference: outcome.providerObjectReference ?? undefined,
    connectedAccountId: outcome.connectedAccountId ?? undefined,
    amount: outcome.amount ?? undefined,
    currency: outcome.currency ?? undefined,
    processedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(commerceProviderEvents.id, eventRowId));
}

async function failCommerceProviderEvent(eventRowId: string, error: unknown) {
  await db.update(commerceProviderEvents).set({
    status: "failed",
    errorCode: error instanceof Error ? error.name.slice(0, 120) : "provider_event_error",
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Commerce provider event failed",
    updatedAt: new Date(),
  }).where(eq(commerceProviderEvents.id, eventRowId));
}

async function orderForPaymentReference(paymentReference: string | null, fallbackOrderId?: string | null) {
  if (fallbackOrderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, fallbackOrderId)).limit(1);
    if (order) return order;
  }
  if (!paymentReference) return null;
  const [order] = await db.select().from(orders).where(or(
    eq(orders.providerPaymentReference, paymentReference),
    eq(orders.providerReference, paymentReference),
  )).limit(1);
  if (order) return order;
  const [allocation] = await db.select({ order: orders }).from(creatorEarningsAllocations)
    .innerJoin(orders, eq(creatorEarningsAllocations.orderId, orders.id))
    .where(eq(creatorEarningsAllocations.paymentIntentReference, paymentReference))
    .limit(1);
  if (allocation?.order) return allocation.order;
  if (paymentReference.startsWith("pi_")) {
    const sessions = await getStripe().checkout.sessions.list({ payment_intent: paymentReference, limit: 2 });
    for (const session of sessions.data) {
      const [legacyOrder] = await db.select().from(orders).where(eq(orders.providerReference, session.id)).limit(1);
      if (legacyOrder) {
        await db.update(orders).set({ providerPaymentReference: paymentReference, updatedAt: new Date() })
          .where(eq(orders.id, legacyOrder.id));
        return { ...legacyOrder, providerPaymentReference: paymentReference };
      }
    }
  }
  return null;
}

async function setOrderFinancialState(input: {
  order: typeof orders.$inferSelect;
  financialStatus: "paid" | "partially_refunded" | "refunded" | "disputed" | "dispute_won" | "dispute_lost";
  refundedAmount?: number;
  disputedAmount?: number;
  accessActive: boolean;
}) {
  await db.transaction(async (tx) => {
    await tx.update(orders).set({
      financialStatus: input.financialStatus,
      ...(input.refundedAmount === undefined ? {} : { refundedAmount: input.refundedAmount }),
      ...(input.disputedAmount === undefined ? {} : { disputedAmount: input.disputedAmount }),
      lastProviderEventAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, input.order.id));

    await tx.update(entitlements).set({
      status: input.accessActive ? "active" : "revoked",
      endsAt: input.accessActive ? null : new Date(),
      updatedAt: new Date(),
    }).where(eq(entitlements.sourceOrderId, input.order.id));

    const linkedCommunities = await tx.selectDistinct({ communityId: products.communityId })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(and(eq(orderItems.orderId, input.order.id), isNotNull(products.communityId)));
    for (const { communityId } of linkedCommunities) {
      if (communityId === null) continue;
      if (input.accessActive) {
        await tx.insert(communityMemberships).values({
          userId: input.order.buyerId,
          communityId,
          role: "member",
        }).onConflictDoNothing();
      } else {
        const [otherActiveAccess] = await tx.select({ id: entitlements.id })
          .from(entitlements)
          .innerJoin(products, eq(entitlements.productId, products.id))
          .where(and(
            eq(entitlements.userId, input.order.buyerId),
            eq(entitlements.status, "active"),
            eq(products.communityId, communityId),
          )).limit(1);
        if (!otherActiveAccess) {
          await tx.delete(communityMemberships).where(and(
            eq(communityMemberships.userId, input.order.buyerId),
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.role, "member"),
            eq(communityMemberships.status, "active"),
          ));
        }
      }
    }
  });
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<CommerceEventOutcome> {
  const paymentReference = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
  const order = await orderForPaymentReference(paymentReference, charge.metadata?.orderId ?? charge.transfer_group);
  if (!order) return { status: "ignored", providerObjectReference: charge.id, amount: charge.amount_refunded / 100, currency: charge.currency };
  const refundState = refundedOrderState({ chargeAmountCents: charge.amount, refundedAmountCents: charge.amount_refunded, providerMarkedRefunded: charge.refunded });
  const refundedAmount = refundState.refundedAmount;
  await setOrderFinancialState({
    order,
    financialStatus: refundState.financialStatus,
    refundedAmount,
    disputedAmount: order.disputedAmount,
    accessActive: refundState.accessActive,
  });
  const allocations = await db.select().from(creatorEarningsAllocations).where(eq(creatorEarningsAllocations.orderId, order.id));
  for (const allocation of allocations) {
    await db.update(creatorEarningsAllocations).set({
      status: refundState.fullyRefunded ? "refunded" : "partially_refunded",
      refundedAmount,
      reversedAmount: allocationReversalAmount({ creatorNetAmount: allocation.creatorNetAmount, affectedAmountCents: charge.amount_refunded, orderAmountCents: charge.amount }),
      updatedAt: new Date(),
    }).where(eq(creatorEarningsAllocations.id, allocation.id));
  }
  return { orderId: order.id, providerObjectReference: charge.id, amount: refundedAmount, currency: charge.currency };
}

async function handleChargeDispute(dispute: Stripe.Dispute): Promise<CommerceEventOutcome> {
  const charge = typeof dispute.charge === "string" ? await getStripe().charges.retrieve(dispute.charge) : dispute.charge;
  const paymentReference = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
  const order = await orderForPaymentReference(paymentReference, charge.metadata?.orderId ?? charge.transfer_group);
  if (!order) return { status: "ignored", providerObjectReference: dispute.id, amount: dispute.amount / 100, currency: dispute.currency };
  const disputeState = disputedOrderState({ providerStatus: dispute.status, disputedAmountCents: dispute.amount, fullyRefunded: order.refundedAmount >= order.totalAmount });
  await setOrderFinancialState({ order, financialStatus: disputeState.financialStatus, disputedAmount: disputeState.disputedAmount, accessActive: disputeState.accessActive });
  const allocations = await db.select().from(creatorEarningsAllocations).where(eq(creatorEarningsAllocations.orderId, order.id));
  for (const allocation of allocations) {
    await db.update(creatorEarningsAllocations).set({
      status: disputeState.won ? (allocation.refundedAmount > 0 ? "partially_refunded" : "paid") : disputeState.lost ? "dispute_lost" : "disputed",
      disputedAmount: disputeState.disputedAmount,
      reversedAmount: disputeState.lost ? Math.max(allocation.reversedAmount, allocationReversalAmount({ creatorNetAmount: allocation.creatorNetAmount, affectedAmountCents: dispute.amount, orderAmountCents: cents(order.totalAmount) })) : allocation.reversedAmount,
      updatedAt: new Date(),
    }).where(eq(creatorEarningsAllocations.id, allocation.id));
  }
  return { orderId: order.id, providerObjectReference: dispute.id, amount: dispute.amount / 100, currency: dispute.currency };
}

async function handleConnectedAccountUpdated(account: Stripe.Account): Promise<CommerceEventOutcome> {
  await db.update(creatorPaymentAccounts).set(paymentAccountFields(account))
    .where(eq(creatorPaymentAccounts.stripeAccountId, account.id));
  return { providerObjectReference: account.id, connectedAccountId: account.id };
}

async function handlePayoutEvent(payout: Stripe.Payout, connectedAccountId: string | null): Promise<CommerceEventOutcome> {
  if (!connectedAccountId) return { status: "ignored", providerObjectReference: payout.id, amount: payout.amount / 100, currency: payout.currency };
  const [account] = await db.select().from(creatorPaymentAccounts)
    .where(eq(creatorPaymentAccounts.stripeAccountId, connectedAccountId)).limit(1);
  if (!account) return { status: "ignored", connectedAccountId, providerObjectReference: payout.id, amount: payout.amount / 100, currency: payout.currency };
  await db.insert(creatorPayoutEvents).values({
    sellerUserId: account.userId,
    stripeConnectedAccountId: connectedAccountId,
    providerPayoutId: payout.id,
    amount: payout.amount / 100,
    currency: payout.currency,
    status: payout.status,
    arrivalAt: payout.arrival_date ? new Date(payout.arrival_date * 1_000) : null,
    failureCode: payout.failure_code ?? null,
    failureMessage: payout.failure_message ?? null,
  }).onConflictDoUpdate({
    target: creatorPayoutEvents.providerPayoutId,
    set: {
      status: payout.status,
      arrivalAt: payout.arrival_date ? new Date(payout.arrival_date * 1_000) : null,
      failureCode: payout.failure_code ?? null,
      failureMessage: payout.failure_message ?? null,
      updatedAt: new Date(),
    },
  });
  return { connectedAccountId, providerObjectReference: payout.id, amount: payout.amount / 100, currency: payout.currency };
}

async function processCommerceProviderEvent(event: Stripe.Event): Promise<CommerceEventOutcome> {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") return { status: "ignored", providerObjectReference: session.id };
    await fulfillCheckoutSession(session);
    return { orderId: session.metadata?.orderId ?? session.client_reference_id, providerObjectReference: session.id, amount: (session.amount_total ?? 0) / 100, currency: session.currency };
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    await synchronizeSubscriptionAccess(subscription);
    return { orderId: subscription.metadata?.orderId, providerObjectReference: subscription.id };
  }
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    await recordPaidSubscriptionInvoice(invoice);
    const subscriptionReference = invoiceSubscriptionReference(invoice);
    const [order] = subscriptionReference ? await db.select().from(orders).where(eq(orders.providerSubscriptionReference, subscriptionReference)).limit(1) : [];
    return { orderId: order?.id, providerObjectReference: invoice.id, amount: invoice.amount_paid / 100, currency: invoice.currency };
  }
  if (event.type === "charge.refunded") return handleChargeRefunded(event.data.object as Stripe.Charge);
  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed") {
    return handleChargeDispute(event.data.object as Stripe.Dispute);
  }
  if (event.type === "account.updated") return handleConnectedAccountUpdated(event.data.object as Stripe.Account);
  if (["payout.created", "payout.updated", "payout.paid", "payout.failed", "payout.canceled"].includes(event.type)) {
    return handlePayoutEvent(event.data.object as Stripe.Payout, event.account ?? null);
  }
  return { status: "ignored" };
}

/**
 * Stripe requires the exact incoming bytes for webhook verification. The
 * application's JSON middleware captures those bytes in req.rawBody before it
 * parses the request, so this route must remain registered before any handler
 * that could rely on the parsed body.
 */
export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const webhookSecrets = [
      configuredValue("STRIPE_WEBHOOK_SECRET"),
      configuredValue("STRIPE_CONNECT_WEBHOOK_SECRET"),
    ].filter((secret): secret is string => Boolean(secret));
    if (!isStripeConfigured() || webhookSecrets.length === 0) {
      return res.status(503).json({ message: "Stripe webhook is not configured" });
    }

    const signature = req.header("stripe-signature");
    if (!signature || !req.rawBody) {
      return res.status(400).json({ message: "Missing Stripe signature" });
    }

    let event: Stripe.Event | null = null;
    let lastVerificationError: unknown;
    for (const webhookSecret of webhookSecrets) {
      try {
        event = getStripe().webhooks.constructEvent(req.rawBody, signature, webhookSecret);
        break;
      } catch (error) {
        lastVerificationError = error;
      }
    }
    if (!event) {
      const detail = lastVerificationError instanceof Error ? lastVerificationError.message : "Invalid Stripe webhook";
      return res.status(400).json({ message: detail });
    }

    const payloadSha256 = createHash("sha256").update(req.rawBody).digest("hex");
    const started = await beginCommerceProviderEvent(event, payloadSha256);
    if (!started.shouldProcess) return res.status(200).json({ received: true, duplicate: true });

    try {
      const outcome = await processCommerceProviderEvent(event);
      await finishCommerceProviderEvent(started.eventRow.id, outcome);
      return res.status(200).json({ received: true });
    } catch (error) {
      await failCommerceProviderEvent(started.eventRow.id, error).catch(() => undefined);
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
      disabledReason: account.disabledReason,
      requirementsCurrentlyDue: account.requirementsCurrentlyDue,
      requirementsPastDue: account.requirementsPastDue,
      country: account.country,
      defaultCurrency: account.defaultCurrency,
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
      res.json({ connected: true, accountType: refreshed.accountType, status: refreshed.status, detailsSubmitted: refreshed.detailsSubmitted, chargesEnabled: refreshed.chargesEnabled, payoutsEnabled: refreshed.payoutsEnabled, disabledReason: refreshed.disabledReason, requirementsCurrentlyDue: refreshed.requirementsCurrentlyDue, requirementsPastDue: refreshed.requirementsPastDue, country: refreshed.country, defaultCurrency: refreshed.defaultCurrency, platformFeeBps: platformFeeBps(), lastSyncedAt: refreshed.lastSyncedAt });
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
          ...paymentAccountFields(stripeAccount),
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
    const [allocations, payoutEvents] = await Promise.all([
      db.select().from(creatorEarningsAllocations)
        .where(eq(creatorEarningsAllocations.sellerUserId, req.dbUser!.id))
        .orderBy(desc(creatorEarningsAllocations.createdAt)),
      db.select().from(creatorPayoutEvents)
        .where(eq(creatorPayoutEvents.sellerUserId, req.dbUser!.id))
        .orderBy(desc(creatorPayoutEvents.updatedAt)),
    ]);
    const totals = allocations.reduce((result, allocation) => {
      if (["payment_required", "canceled", "refunded", "dispute_lost"].includes(allocation.status)) return result;
      const retainedRatio = allocation.grossAmount > 0
        ? Math.max(0, 1 - allocation.refundedAmount / allocation.grossAmount)
        : 0;
      const creatorNet = Math.max(0, allocation.creatorNetAmount - allocation.reversedAmount);
      result.grossAmount += Math.max(0, allocation.grossAmount - allocation.refundedAmount);
      result.platformFeeAmount += Math.max(0, allocation.platformFeeAmount * retainedRatio);
      result.creatorNetAmount += creatorNet;
      if (["paid", "partially_refunded", "dispute_won"].includes(allocation.status)) result.paidAmount += creatorNet;
      return result;
    }, { grossAmount: 0, platformFeeAmount: 0, creatorNetAmount: 0, paidAmount: 0 });
    res.json({ allocations, payoutEvents, totals, platformFeeBps: platformFeeBps() });
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

      let billingTerms;
      try {
        billingTerms = checkoutBillingTerms(items.map((item) => ({
          billingModel: item.billingModelSnapshot,
          billingInterval: item.billingIntervalSnapshot,
        })));
      } catch (error) {
        return res.status(409).json({ message: error instanceof Error ? error.message : "Incompatible billing schedule" });
      }

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
      const recurring = billingTerms.billingModel === "recurring";
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: recurring ? "subscription" : "payment",
        // This marketplace currently owns its merchant-of-record and tax
        // decisions. Stripe can enable Managed Payments at the account level,
        // so opt out explicitly for every Checkout mode until that separate
        // legal/tax launch decision is made.
        managed_payments: { enabled: false },
        integration_identifier: "creativesos_checkout_kqmwzjhf",
        client_reference_id: order.id,
        success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/cart?checkout=cancelled`,
        metadata: { orderId: order.id, buyerId: String(order.buyerId) },
        line_items: items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: order.currency,
            unit_amount: cents(item.unitAmount),
            product_data: { name: item.titleSnapshot },
            ...(recurring
              ? {
                  recurring: {
                    interval: (billingTerms.billingInterval ?? "month") as Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval,
                  },
                }
              : {}),
          },
        })),
      };
      if (recurring) {
        sessionParams.subscription_data = {
          metadata: { orderId: order.id, buyerId: String(order.buyerId) },
          ...(creatorRoute ? {
            transfer_data: { destination: creatorRoute.connectedAccountId },
            application_fee_percent: platformFeeBps() / 100,
          } : {}),
        };
      } else {
        sessionParams.payment_intent_data = paymentIntentData;
      }
      const session = await getStripe().checkout.sessions.create(sessionParams);
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

  app.post("/api/orders/:id/subscription/cancel", attachUser, async (req, res) => {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Subscription management is not configured yet" });
    }
    try {
      const order = await getBuyerOrder(req.params.id, req.dbUser!.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "paid" || !order.providerSubscriptionReference) {
        return res.status(409).json({ message: "This order does not have an active subscription" });
      }
      if (!subscriptionCanCancel(order.subscriptionStatus, order.subscriptionCancelAtPeriodEnd)) {
        return res.status(409).json({ message: "This subscription is already inactive" });
      }
      const subscription = await getStripe().subscriptions.update(order.providerSubscriptionReference, {
        cancel_at_period_end: true,
      });
      const cancelAt = subscriptionAccessEndsAt({
        cancelAt: subscription.cancel_at,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        itemPeriodEnds: subscription.items.data.map((item) => item.current_period_end),
      });
      await db.update(orders).set({
        subscriptionStatus: subscription.status,
        subscriptionCancelAt: cancelAt,
        subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id));
      res.json({
        orderId: order.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt,
      });
    } catch (error) {
      console.error("Unable to cancel Stripe subscription renewal:", error);
      res.status(502).json({ message: "Unable to cancel renewal. Please try again." });
    }
  });

  app.post("/api/orders/:id/refund", attachUser, async (req, res) => {
    if (!isStripeConfigured()) return res.status(503).json({ message: "Refund management is not configured yet" });
    const idempotencyKey = req.header("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) {
      return res.status(400).json({ message: "A valid Idempotency-Key header is required" });
    }
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (!(await userCanRefundOrder(order.id, req.dbUser!.id, req.dbUser!.role === "admin"))) {
        return res.status(403).json({ message: "You are not authorized to refund this sale" });
      }
      if (order.status !== "paid" || ["refunded", "dispute_lost"].includes(order.financialStatus)) {
        return res.status(409).json({ message: "This order is not refundable" });
      }
      const remainingCents = cents(Math.max(0, order.totalAmount - order.refundedAmount));
      const requestedAmount = req.body?.amountCents === undefined ? remainingCents : Number(req.body.amountCents);
      if (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0 || requestedAmount > remainingCents) {
        return res.status(400).json({ message: "Refund amount exceeds the remaining paid amount" });
      }
      const reason = req.body?.reason;
      if (reason !== undefined && !["duplicate", "fraudulent", "requested_by_customer"].includes(reason)) {
        return res.status(400).json({ message: "Invalid refund reason" });
      }
      const paymentIntent = await refundPaymentReference(order);
      if (!paymentIntent?.startsWith("pi_")) return res.status(409).json({ message: "The Stripe payment reference is unavailable for this order" });
      await db.update(orders).set({ providerPaymentReference: paymentIntent, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      // Reconcile a provider-side refund that completed before a previous
      // request lost its response or before this historical order had a stored
      // PaymentIntent. This avoids issuing a duplicate refund while bringing
      // access and earnings state into line with Stripe.
      const providerPayment = await getStripe().paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge"] });
      const latestCharge = providerPayment.latest_charge;
      const charge = typeof latestCharge === "string" ? await getStripe().charges.retrieve(latestCharge) : latestCharge;
      if (charge && charge.amount_refunded > cents(order.refundedAmount)) {
        await handleChargeRefunded(charge);
        return res.status(200).json({ orderId: order.id, status: "reconciled", amount: charge.amount_refunded / 100, currency: charge.currency });
      }
      const [allocation] = await db.select().from(creatorEarningsAllocations)
        .where(eq(creatorEarningsAllocations.orderId, order.id)).limit(1);
      const refund = await getStripe().refunds.create({
        payment_intent: paymentIntent,
        amount: requestedAmount,
        ...(reason ? { reason: reason as Stripe.RefundCreateParams.Reason } : {}),
        ...(allocation ? {
          reverse_transfer: true,
          refund_application_fee: allocation.platformFeeAmount > 0,
        } : {}),
        metadata: { orderId: order.id, initiatedByUserId: String(req.dbUser!.id) },
      }, { idempotencyKey });
      res.status(202).json({ orderId: order.id, refundId: refund.id, status: refund.status, amount: refund.amount / 100, currency: refund.currency });
    } catch (error) {
      console.error("Unable to refund Stripe order:", error);
      res.status(502).json({ message: "Unable to issue the refund. Please try again." });
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
