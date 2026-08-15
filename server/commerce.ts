import { and, eq, inArray } from "drizzle-orm";
import {
  communityMemberships,
  creatorEarningsAllocations,
  entitlements,
  notifications,
  orderItems,
  orders,
  products,
  shoppingCartItems,
  users,
} from "../shared/schema";
import { db } from "./db";
import { buildPaymentNotifications } from "./payment-notifications";
import { emitProjectionEvent } from "./umh";
import { recordAffiliateOrderConversion } from "./affiliate-platform";
import { finalizePaidEventAccess } from "./booking-ticketing";
import { finalizeMarketplaceOrder } from "./marketplace-maturity";
import { emitDeveloperWebhookEvent } from "./developer-platform";

export type SettleOrderInput = {
  orderId: string;
  paymentProvider: string;
  providerReference: string;
  creatorPaymentIntentReference?: string;
};

/**
 * Trusted-only fulfillment boundary. Payment adapters call this after they
 * verify a provider event; browser requests never receive a path to grant
 * themselves access. The entitlement ledger makes duplicate delivery safe.
 */
export async function settleOrder(input: SettleOrderInput) {
  const paymentProvider = input.paymentProvider.trim();
  const providerReference = input.providerReference.trim();
  if (
    !paymentProvider ||
    paymentProvider.length > 48 ||
    !providerReference ||
    providerReference.length > 255
  ) {
    throw new Error(
      "A valid payment provider and provider reference are required",
    );
  }

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) throw new Error("Order not found");

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    if (!items.length) throw new Error("Order has no items to fulfill");

    if (order.status === "paid") {
      if (
        order.providerReference &&
        order.providerReference !== providerReference
      ) {
        throw new Error(
          "Order was already settled by a different provider reference",
        );
      }
    } else {
      if (!["pending", "payment_required"].includes(order.status)) {
        throw new Error(`Order cannot be settled from status ${order.status}`);
      }
      await tx
        .update(orders)
        .set({
          status: "paid",
          financialStatus: "paid",
          paymentProvider,
          providerReference,
          providerPaymentReference:
            input.creatorPaymentIntentReference ??
            order.providerPaymentReference,
          lastProviderEventAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(orders.id, order.id), eq(orders.status, order.status)));
    }

    const granted = await tx
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
      .onConflictDoNothing()
      .returning();

    // Settlement is also the durable cart boundary. Removing only the paid
    // products keeps unrelated offers intact and makes every device converge.
    await tx.delete(shoppingCartItems).where(
      and(
        eq(shoppingCartItems.userId, order.buyerId),
        inArray(
          shoppingCartItems.productId,
          items.map((item) => item.productId),
        ),
      ),
    );

    // A linked community is a local projection of product entitlement. It is
    // intentionally additive: a moderator's ban remains intact because the
    // membership uniqueness constraint turns a re-purchase into a no-op.
    const linkedProducts = await tx
      .select({
        id: products.id,
        sellerId: products.userId,
        communityId: products.communityId,
      })
      .from(products)
      .where(
        inArray(
          products.id,
          items.map((item) => item.productId),
        ),
      );
    const linkedCommunityIds = Array.from(
      new Set(
        linkedProducts.flatMap((product) =>
          product.communityId === null ? [] : [product.communityId],
        ),
      ),
    );
    const joinedMemberships = linkedCommunityIds.length
      ? await tx
          .insert(communityMemberships)
          .values(
            linkedCommunityIds.map((communityId) => ({
              userId: order.buyerId,
              communityId,
              role: "member",
            })),
          )
          .onConflictDoNothing()
          .returning({ communityId: communityMemberships.communityId })
      : [];

    // Destination charges transfer the creator's share automatically. Mark an
    // existing allocation paid only after Stripe's verified Checkout event;
    // this is independent from platform revenue and from buyer entitlement.
    if (input.creatorPaymentIntentReference) {
      await tx
        .update(creatorEarningsAllocations)
        .set({
          status: "paid",
          paymentIntentReference: input.creatorPaymentIntentReference,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(creatorEarningsAllocations.orderId, order.id),
            eq(creatorEarningsAllocations.status, "payment_required"),
          ),
        );
    }

    const [buyer] = await tx
      .select({
        id: users.id,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(eq(users.id, order.buyerId))
      .limit(1);
    if (!buyer) throw new Error("Order buyer not found");

    const paymentNotifications = buildPaymentNotifications({
      orderId: order.id,
      buyer,
      items: items.map((item) => ({
        title: item.titleSnapshot,
        sellerId: linkedProducts.find(
          (product) => product.id === item.productId,
        )?.sellerId,
      })),
    });
    if (paymentNotifications.length) {
      await tx
        .insert(notifications)
        .values(paymentNotifications)
        .onConflictDoNothing();
    }

    await emitProjectionEvent(
      {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.paid",
        actorUserId: order.buyerId,
        payload: {
          paymentProvider,
          totalAmount: order.totalAmount,
          currency: order.currency,
        },
        idempotencyKey: `order.paid:${order.id}`,
      },
      tx,
    );

    return {
      orderId: order.id,
      settled: true,
      entitlementsGranted: granted.length,
      communitiesJoined: joinedMemberships.length,
    };
  });
  // Settlement is the access authority. Affiliate accounting is independently
  // recoverable and must not revoke a paid buyer if its ledger needs retry.
  await recordAffiliateOrderConversion({ orderId: input.orderId }).catch(
    (error) => console.error("Unable to record affiliate conversion", error),
  );
  await finalizePaidEventAccess(input.orderId).catch((error) =>
    console.error("Unable to finalize paid booking access", error),
  );
  await finalizeMarketplaceOrder(input.orderId).catch((error) =>
    console.error("Unable to finalize marketplace order", error),
  );
  const [completedOrder] = await db
    .select({
      businessId: orders.businessId,
      buyerId: orders.buyerId,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
    })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (completedOrder?.businessId) {
    await emitDeveloperWebhookEvent({
      businessId: completedOrder.businessId,
      eventType: "order.completed",
      aggregateType: "order",
      aggregateId: input.orderId,
      idempotencyKey: `order.completed:${input.orderId}`,
      payload: {
        orderId: input.orderId,
        buyerId: completedOrder.buyerId,
        totalAmount: completedOrder.totalAmount,
        currency: completedOrder.currency,
      },
    }).catch((error) =>
      console.error("Unable to emit order-completed webhook", error),
    );
  }
  return result;
}
