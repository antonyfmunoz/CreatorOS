import { describe, expect, it } from "vitest";
import { groupCartItemsForCheckout, normalizeCartProductIds } from "../shared/cart";

describe("account cart input policy", () => {
  it("deduplicates valid product ids while preserving guest-cart order", () => {
    expect(normalizeCartProductIds([4, 2, 4, 9])).toEqual([4, 2, 9]);
  });

  it("rejects malformed and non-positive ids", () => {
    expect(
      normalizeCartProductIds([1, "2", 0, -3, 2.5, null, undefined]),
    ).toEqual([1]);
    expect(normalizeCartProductIds({ productIds: [1] })).toEqual([]);
  });

  it("bounds merge size before database work", () => {
    expect(normalizeCartProductIds([1, 2, 3], 2)).toEqual([1, 2]);
    expect(normalizeCartProductIds([1, 2, 3], -1)).toEqual([]);
    expect(normalizeCartProductIds([1, 2, 3], Number.NaN)).toEqual([1, 2, 3]);
  });
});

describe("cart checkout routing", () => {
  it("groups platform offers together and creator offers by seller", () => {
    const groups = groupCartItemsForCheckout([
      { id: 1, creatorId: 4, creatorName: "A", payoutMode: "platform" as const, price: 5 },
      { id: 2, creatorId: 5, creatorName: "B", payoutMode: "platform" as const, price: 7 },
      { id: 3, creatorId: 4, creatorName: "A", payoutMode: "creator" as const, price: 11 },
      { id: 4, creatorId: 4, creatorName: "A", payoutMode: "creator" as const, price: 13 },
      { id: 5, creatorId: 5, creatorName: "B", payoutMode: "creator" as const, price: 17 },
    ]);

    expect(groups.map((group) => ({
      key: group.key,
      ids: group.items.map((item) => item.id),
      total: group.total,
    }))).toEqual([
      { key: "platform:one_time", ids: [1, 2], total: 12 },
      { key: "creator:4:one_time", ids: [3, 4], total: 24 },
      { key: "creator:5:one_time", ids: [5], total: 17 },
    ]);
  });

  it("separates one-time, monthly, and yearly offers into compatible checkouts", () => {
    const base = {
      creatorId: 4,
      creatorName: "A",
      payoutMode: "creator" as const,
      price: 10,
    };
    const groups = groupCartItemsForCheckout([
      { ...base, id: 1, billingModel: "one_time" },
      { ...base, id: 2, billingModel: "recurring", billingInterval: "month" },
      { ...base, id: 3, billingModel: "recurring", billingInterval: "year" },
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "creator:4:one_time",
      "creator:4:recurring:month",
      "creator:4:recurring:year",
    ]);
  });
});
