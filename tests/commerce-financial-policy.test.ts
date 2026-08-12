import { describe, expect, it } from "vitest";
import { allocationReversalAmount, disputedOrderState, refundedOrderState } from "../shared/commerce-financial-policy";

describe("commerce financial lifecycle", () => {
  it("keeps access for a partial refund and revokes it for a full refund", () => {
    expect(refundedOrderState({ chargeAmountCents: 10_000, refundedAmountCents: 2_500, providerMarkedRefunded: false })).toMatchObject({
      financialStatus: "partially_refunded",
      accessActive: true,
      refundedAmount: 25,
      refundedRatio: 0.25,
    });
    expect(refundedOrderState({ chargeAmountCents: 10_000, refundedAmountCents: 10_000, providerMarkedRefunded: true })).toMatchObject({
      financialStatus: "refunded",
      accessActive: false,
    });
  });

  it("fails closed during an active dispute and restores only a won non-refunded purchase", () => {
    expect(disputedOrderState({ providerStatus: "under_review", disputedAmountCents: 5_000, fullyRefunded: false })).toMatchObject({
      financialStatus: "disputed",
      accessActive: false,
      disputedAmount: 50,
    });
    expect(disputedOrderState({ providerStatus: "lost", disputedAmountCents: 5_000, fullyRefunded: false })).toMatchObject({
      financialStatus: "dispute_lost",
      accessActive: false,
    });
    expect(disputedOrderState({ providerStatus: "won", disputedAmountCents: 5_000, fullyRefunded: false })).toMatchObject({
      financialStatus: "dispute_won",
      accessActive: true,
      disputedAmount: 0,
    });
    expect(disputedOrderState({ providerStatus: "won", disputedAmountCents: 5_000, fullyRefunded: true }).accessActive).toBe(false);
  });

  it("calculates proportional creator transfer reversal in cents-safe math", () => {
    expect(allocationReversalAmount({ creatorNetAmount: 80, affectedAmountCents: 2_500, orderAmountCents: 10_000 })).toBe(20);
    expect(allocationReversalAmount({ creatorNetAmount: 80.01, affectedAmountCents: 10_000, orderAmountCents: 10_000 })).toBe(80.01);
  });

  it("rejects provider values outside the governed lifecycle", () => {
    expect(() => refundedOrderState({ chargeAmountCents: 100, refundedAmountCents: 101, providerMarkedRefunded: false })).toThrow(/outside/i);
    expect(() => disputedOrderState({ providerStatus: "invented", disputedAmountCents: 100, fullyRefunded: false })).toThrow(/unsupported/i);
  });
});
