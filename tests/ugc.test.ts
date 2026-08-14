import { describe, expect, it } from "vitest";
import { canTransitionUgcApplication, canTransitionUgcCollaboration, ugcCommissionAmount, ugcEarningsSummary, ugcOpportunityInputSchema, validateUgcCompensation } from "../shared/ugc";

describe("native UGC domain", () => {
  it("requires compensation terms that match the advertised model", () => {
    expect(() => validateUgcCompensation({ compensationModel: "fixed", fixedFeeCents: 25_000, commissionBps: 0 })).not.toThrow();
    expect(() => validateUgcCompensation({ compensationModel: "hybrid", fixedFeeCents: 25_000, commissionBps: 1_000 })).not.toThrow();
    expect(() => validateUgcCompensation({ compensationModel: "commission", fixedFeeCents: 0, commissionBps: 0 })).toThrow(/commission rate/i);
    expect(() => validateUgcCompensation({ compensationModel: "gifted", fixedFeeCents: 1, commissionBps: 0 })).toThrow(/cannot promise/i);
  });

  it("bounds deliverables, usage rights, and eligibility in the accepted brief", () => {
    const result = ugcOpportunityInputSchema.parse({
      title: "Launch creative", description: "Produce a tested vertical product story.", category: "Wellness",
      platforms: ["Instagram"], deliverables: [{ title: "Vertical video", quantity: 2, format: "vertical_video" }],
      compensationModel: "hybrid", fixedFeeCents: 20_000, commissionBps: 1_000, currency: "USD",
      usageRights: { placement: "organic_and_paid", durationDays: 90, allowDerivativeEdits: true, includeRawFootage: false, includeLikeness: true, includeVoice: true, exclusivityDays: 0 },
      eligibility: { requiresPortfolio: true }, revisionLimit: 2,
    });
    expect(result.currency).toBe("usd");
    expect(result.deliverables[0]).toMatchObject({ quantity: 2, notes: "" });
    expect(result.usageRights.territories).toEqual(["Worldwide"]);
    expect(result.eligibility.minimumAge).toBe(18);
  });

  it("enforces terminal states and the revision loop", () => {
    expect(canTransitionUgcApplication("submitted", "shortlisted")).toBe(true);
    expect(canTransitionUgcApplication("accepted", "withdrawn")).toBe(false);
    expect(canTransitionUgcCollaboration("submitted", "revision_requested")).toBe(true);
    expect(canTransitionUgcCollaboration("revision_requested", "submitted")).toBe(true);
    expect(canTransitionUgcCollaboration("completed", "in_progress")).toBe(false);
  });

  it("calculates commission and separates pending, approved, and paid earnings", () => {
    expect(ugcCommissionAmount(100_001, 1_250)).toBe(12_500);
    expect(ugcEarningsSummary([{ amountCents: 10_000, status: "pending" }, { amountCents: 20_000, status: "approved" }, { amountCents: 30_000, status: "paid" }])).toEqual({ totalCents: 60_000, pendingCents: 10_000, approvedCents: 20_000, paidCents: 30_000 });
  });
});
