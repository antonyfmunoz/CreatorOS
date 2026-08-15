import { describe, expect, it } from "vitest";
import {
  discountedCheckoutLineAmounts,
  marketplaceDiscountCents,
  marketplacePromotionSchema,
  marketplaceSellerProfileSchema,
} from "../shared/marketplace-maturity";

describe("marketplace maturity contract", () => {
  it("bounds discounts at the checkout subtotal", () => {
    expect(
      marketplaceDiscountCents(2_500, {
        discountType: "fixed",
        fixedAmountCents: 5_000,
        percentageBps: 0,
      }),
    ).toBe(2_500);
    expect(
      marketplaceDiscountCents(10_001, {
        discountType: "percentage",
        fixedAmountCents: 0,
        percentageBps: 1_500,
      }),
    ).toBe(1_500);
  });

  it("makes provider line items equal the signed discounted order", () => {
    const amounts = discountedCheckoutLineAmounts(
      [
        { unitAmount: 20, quantity: 1 },
        { unitAmount: 30, quantity: 1 },
      ],
      12.5,
    );
    expect(amounts).toEqual([750, 3_000]);
    expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(3_750);
  });

  it("requires explicit seller policy acknowledgement and bounded trials", () => {
    expect(
      marketplaceSellerProfileSchema.safeParse({
        displayName: "Studio",
        slug: "studio",
        supportEmail: "support@example.com",
        refundPolicy: "Refund requests receive an accountable human review.",
        operationalPolicyVersion: "v1",
        acceptOperationalPolicy: false,
      }).success,
    ).toBe(false);
    expect(
      marketplacePromotionSchema.safeParse({
        name: "Trial",
        code: "TRY120",
        discountType: "trial",
        trialDays: 120,
      }).success,
    ).toBe(false);
  });
});
