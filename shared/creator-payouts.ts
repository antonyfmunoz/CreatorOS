/**
 * Provider-neutral money rules. Values enter and leave Stripe as integer cents
 * so the platform fee and creator earnings cannot drift through float math.
 */
export function cents(amount: number) {
  const value = Math.round(amount * 100);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Order has an invalid total");
  return value;
}

export function platformFeeBps() {
  const raw = process.env.STRIPE_PLATFORM_FEE_BPS?.trim() || "0";
  if (!/^\d+$/.test(raw)) throw new Error("STRIPE_PLATFORM_FEE_BPS must be a whole number between 0 and 10000");
  const feeBps = Number(raw);
  if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("STRIPE_PLATFORM_FEE_BPS must be between 0 and 10000");
  }
  return feeBps;
}

export function calculateCreatorAllocation(grossAmount: number, feeBps = platformFeeBps()) {
  const grossCents = cents(grossAmount);
  const platformFeeCents = Math.floor((grossCents * feeBps) / 10_000);
  return {
    grossAmount: grossCents / 100,
    platformFeeAmount: platformFeeCents / 100,
    creatorNetAmount: (grossCents - platformFeeCents) / 100,
    applicationFeeCents: platformFeeCents,
  };
}
