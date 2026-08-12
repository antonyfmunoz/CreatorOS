/**
 * Treat cart input as an untrusted set. The server uses this for both a single
 * add and the guest-to-account merge boundary.
 */
export function normalizeCartProductIds(value: unknown, limit = 50) {
  if (!Array.isArray(value)) return [];
  const boundedLimit = Number.isInteger(limit)
    ? Math.min(100, Math.max(0, limit))
    : 50;
  return Array.from(
    new Set(
      value.filter(
        (productId): productId is number =>
          Number.isInteger(productId) && productId > 0,
      ),
    ),
  ).slice(0, boundedLimit);
}

export type CheckoutGroupItem = {
  id: number;
  creatorId: number;
  creatorName: string;
  payoutMode: "platform" | "creator";
  billingModel?: "one_time" | "recurring";
  billingInterval?: "month" | "year" | null;
  price: number;
};

export type CartCheckoutGroup<T extends CheckoutGroupItem> = {
  key: string;
  label: string;
  items: T[];
  total: number;
};

/** Mirrors the server's order-routing constraint so every checkout button is valid. */
export function groupCartItemsForCheckout<T extends CheckoutGroupItem>(
  items: T[],
): CartCheckoutGroup<T>[] {
  const groups = new Map<string, CartCheckoutGroup<T>>();
  for (const item of items) {
    const isCreatorPayout = item.payoutMode === "creator";
    const schedule = item.billingModel === "recurring"
      ? `recurring:${item.billingInterval ?? "month"}`
      : "one_time";
    const revenueOwner = isCreatorPayout ? `creator:${item.creatorId}` : "platform";
    const key = `${revenueOwner}:${schedule}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      existing.total += item.price;
      continue;
    }
    groups.set(key, {
      key,
      label: isCreatorPayout ? item.creatorName : "CreativesOS",
      items: [item],
      total: item.price,
    });
  }
  return Array.from(groups.values());
}
