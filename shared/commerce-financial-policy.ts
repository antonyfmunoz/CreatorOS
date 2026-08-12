export const stripeDisputeStatuses = [
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "won",
  "lost",
] as const;

export function refundedOrderState(input: { chargeAmountCents: number; refundedAmountCents: number; providerMarkedRefunded: boolean }) {
  if (!Number.isSafeInteger(input.chargeAmountCents) || input.chargeAmountCents <= 0) throw new Error("Charge amount must be a positive integer");
  if (!Number.isSafeInteger(input.refundedAmountCents) || input.refundedAmountCents < 0 || input.refundedAmountCents > input.chargeAmountCents) {
    throw new Error("Refunded amount is outside the charge boundary");
  }
  const fullyRefunded = input.providerMarkedRefunded || input.refundedAmountCents === input.chargeAmountCents;
  return {
    fullyRefunded,
    financialStatus: fullyRefunded ? "refunded" as const : "partially_refunded" as const,
    accessActive: !fullyRefunded,
    refundedAmount: input.refundedAmountCents / 100,
    refundedRatio: input.refundedAmountCents / input.chargeAmountCents,
  };
}

export function disputedOrderState(input: { providerStatus: string; disputedAmountCents: number; fullyRefunded: boolean }) {
  if (!Number.isSafeInteger(input.disputedAmountCents) || input.disputedAmountCents <= 0) throw new Error("Disputed amount must be a positive integer");
  if (!(stripeDisputeStatuses as readonly string[]).includes(input.providerStatus)) throw new Error("Unsupported Stripe dispute status");
  const won = input.providerStatus === "won" || input.providerStatus === "warning_closed";
  const lost = input.providerStatus === "lost";
  return {
    won,
    lost,
    financialStatus: won ? "dispute_won" as const : lost ? "dispute_lost" as const : "disputed" as const,
    accessActive: won && !input.fullyRefunded,
    disputedAmount: won ? 0 : input.disputedAmountCents / 100,
  };
}

export function allocationReversalAmount(input: { creatorNetAmount: number; affectedAmountCents: number; orderAmountCents: number }) {
  if (!Number.isSafeInteger(input.affectedAmountCents) || input.affectedAmountCents < 0) throw new Error("Affected amount must be a non-negative integer");
  if (!Number.isSafeInteger(input.orderAmountCents) || input.orderAmountCents <= 0) throw new Error("Order amount must be a positive integer");
  const ratio = Math.min(1, input.affectedAmountCents / input.orderAmountCents);
  return Math.round(input.creatorNetAmount * ratio * 100) / 100;
}
