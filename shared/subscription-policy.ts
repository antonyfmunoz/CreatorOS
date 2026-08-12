export const subscriptionAccessStatuses = ["active", "trialing", "past_due"] as const;
export const subscriptionInactiveStatuses = ["canceled", "incomplete_expired", "unpaid"] as const;
export const subscriptionTerminalStatuses = ["canceled", "incomplete_expired"] as const;

export function subscriptionGrantsAccess(status: string) {
  return subscriptionAccessStatuses.includes(status as (typeof subscriptionAccessStatuses)[number]);
}

export function subscriptionCanCancel(status: string | null | undefined, cancelAtPeriodEnd = false) {
  return !cancelAtPeriodEnd && !subscriptionInactiveStatuses.includes(status as (typeof subscriptionInactiveStatuses)[number]);
}

export function subscriptionTransitionAllowed(currentStatus: string | null | undefined, nextStatus: string) {
  const terminal = subscriptionTerminalStatuses.includes(currentStatus as (typeof subscriptionTerminalStatuses)[number]);
  return !(terminal && subscriptionGrantsAccess(nextStatus));
}

export function subscriptionAccessEndsAt(input: {
  cancelAt?: number | null;
  cancelAtPeriodEnd?: boolean;
  itemPeriodEnds?: number[];
}) {
  if (!input.cancelAtPeriodEnd) return null;
  const unixSeconds = input.cancelAt
    ?? Math.max(0, ...(input.itemPeriodEnds ?? []).filter((value) => Number.isSafeInteger(value) && value > 0));
  return unixSeconds > 0 ? new Date(unixSeconds * 1000) : null;
}
