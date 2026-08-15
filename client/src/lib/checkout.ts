import { apiRequest } from "@/lib/queryClient";

type PreparedOrder = { id: string };
type CheckoutSession = { checkoutUrl: string };

/** Starts server-created Stripe Checkout. Prices and access never come from the browser. */
export async function startStripeCheckout(
  productIds: number[],
  idempotencyKey = crypto.randomUUID(),
  promotionCode = "",
) {
  const order = await apiRequest("POST", "/api/orders", {
    productIds,
    idempotencyKey,
    promotionCode,
  });
  const prepared = (await order.json()) as PreparedOrder;
  const session = await apiRequest(
    "POST",
    `/api/orders/${prepared.id}/checkout`,
    {},
  );
  const checkout = (await session.json()) as CheckoutSession;
  if (!checkout.checkoutUrl)
    throw new Error("Secure checkout could not be started");
  window.location.assign(checkout.checkoutUrl);
}

export async function resumeStripeCheckout(orderId: string) {
  const response = await apiRequest(
    "POST",
    `/api/orders/${orderId}/checkout`,
    {},
  );
  const checkout = (await response.json()) as CheckoutSession;
  if (!checkout.checkoutUrl)
    throw new Error("Secure checkout could not be resumed");
  window.location.assign(checkout.checkoutUrl);
}
