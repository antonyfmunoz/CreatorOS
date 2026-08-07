import { describe, expect, it } from "vitest";
import { calculateCreatorAllocation, cents } from "../shared/creator-payouts";

describe("creator marketplace money separation", () => {
  it("splits a creator sale in cents and preserves the creator net", () => {
    expect(calculateCreatorAllocation(19.99, 1_000)).toEqual({
      grossAmount: 19.99,
      platformFeeAmount: 1.99,
      creatorNetAmount: 18,
      applicationFeeCents: 199,
    });
  });

  it("allows an explicit zero-fee policy without blending creator money into platform revenue", () => {
    expect(calculateCreatorAllocation(10, 0)).toEqual({
      grossAmount: 10,
      platformFeeAmount: 0,
      creatorNetAmount: 10,
      applicationFeeCents: 0,
    });
  });

  it("rejects invalid monetary values before sending them to Stripe", () => {
    expect(() => cents(-1)).toThrow("invalid total");
    expect(() => cents(Number.NaN)).toThrow("invalid total");
  });
});
