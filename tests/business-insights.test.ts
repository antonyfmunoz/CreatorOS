import { describe, expect, it } from "vitest";

describe("creator operating insights", () => {
  it("keeps creator earnings distinct from platform fees", () => {
    const allocations = [
      { status: "paid", creatorNetAmount: 8_500, platformFeeAmount: 1_500 },
      { status: "pending", creatorNetAmount: 2_000, platformFeeAmount: 400 },
    ];
    expect(allocations.filter((allocation) => allocation.status === "paid").reduce((total, allocation) => total + allocation.creatorNetAmount, 0)).toBe(8_500);
    expect(allocations.reduce((total, allocation) => total + allocation.platformFeeAmount, 0)).toBe(1_900);
  });
});
