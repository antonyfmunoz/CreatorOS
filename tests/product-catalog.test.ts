import { describe, expect, it } from "vitest";
import {
  checkoutBillingTerms,
  normalizeProductCommercialTerms,
  productTypeFromLegacyCategory,
} from "../shared/product-catalog";

describe("MVP product catalog", () => {
  it("preserves legacy offers through a deterministic type mapping", () => {
    expect(productTypeFromLegacyCategory("Course")).toBe("course");
    expect(productTypeFromLegacyCategory("Community Membership")).toBe("community");
    expect(productTypeFromLegacyCategory("Templates")).toBe("digital_download");
  });

  it("limits recurring billing to membership access products", () => {
    expect(normalizeProductCommercialTerms({
      productType: "membership",
      billingModel: "recurring",
      billingInterval: "year",
    })).toEqual({ productType: "membership", billingModel: "recurring", billingInterval: "year" });
    expect(() => normalizeProductCommercialTerms({
      productType: "course",
      billingModel: "recurring",
      billingInterval: "month",
    })).toThrow("Recurring billing is available");
  });

  it("rejects mixed one-time and recurring checkout schedules", () => {
    expect(checkoutBillingTerms([
      { billingModel: "recurring", billingInterval: "month" },
      { billingModel: "recurring", billingInterval: "month" },
    ])).toEqual({ billingModel: "recurring", billingInterval: "month" });
    expect(() => checkoutBillingTerms([
      { billingModel: "one_time", billingInterval: null },
      { billingModel: "recurring", billingInterval: "month" },
    ])).toThrow("same billing schedule");
  });
});
