import { describe, expect, it } from "vitest";
import { subscriptionAccessEndsAt, subscriptionCanCancel, subscriptionGrantsAccess, subscriptionTransitionAllowed } from "../shared/subscription-policy";

describe("subscription access policy", () => {
  it("keeps access through active, trialing, and past-due recovery states", () => {
    expect(["active", "trialing", "past_due"].map(subscriptionGrantsAccess)).toEqual([true, true, true]);
    expect(["canceled", "unpaid", "incomplete_expired"].map(subscriptionGrantsAccess)).toEqual([false, false, false]);
  });

  it("only offers cancellation while renewal is still active", () => {
    expect(subscriptionCanCancel("active")).toBe(true);
    expect(subscriptionCanCancel("active", true)).toBe(false);
    expect(subscriptionCanCancel("canceled")).toBe(false);
  });

  it("uses an explicit cancellation date or the latest item period end", () => {
    expect(subscriptionAccessEndsAt({ cancelAtPeriodEnd: false, itemPeriodEnds: [100] })).toBeNull();
    expect(subscriptionAccessEndsAt({ cancelAtPeriodEnd: true, cancelAt: 200, itemPeriodEnds: [100] })?.toISOString()).toBe("1970-01-01T00:03:20.000Z");
    expect(subscriptionAccessEndsAt({ cancelAtPeriodEnd: true, itemPeriodEnds: [100, 300] })?.toISOString()).toBe("1970-01-01T00:05:00.000Z");
  });

  it("rejects stale reactivation after a terminal subscription state", () => {
    expect(subscriptionTransitionAllowed("active", "past_due")).toBe(true);
    expect(subscriptionTransitionAllowed("unpaid", "active")).toBe(true);
    expect(subscriptionTransitionAllowed("canceled", "active")).toBe(false);
    expect(subscriptionTransitionAllowed("incomplete_expired", "trialing")).toBe(false);
  });
});
