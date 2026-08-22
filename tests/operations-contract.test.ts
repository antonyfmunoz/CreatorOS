import { describe, expect, it } from "vitest";
import {
  errorBudget,
  estimatedComputeCostMicros,
  operationalBudgetSchema,
  operationalServiceLevels,
} from "../shared/operations";

describe("operations control plane contract", () => {
  it("publishes bounded objectives for every desired-state workload", () => {
    expect(operationalServiceLevels.map((item) => item.service)).toEqual([
      "playback", "messaging", "automation", "commerce", "realtime", "developer_api", "webhooks", "media_processing", "rendering",
    ]);
    expect(operationalServiceLevels.every((item) => item.targetAvailability >= 0.995 && item.targetAvailability < 1)).toBe(true);
  });

  it("attributes configured compute rates without inventing unconfigured cost", () => {
    expect(estimatedComputeCostMicros(90_000, 120_000)).toBe(180_000);
    expect(estimatedComputeCostMicros(90_000, 0)).toBe(0);
    expect(estimatedComputeCostMicros(-1, 100)).toBe(0);
  });

  it("keeps unmeasured and exhausted error budgets distinguishable", () => {
    expect(errorBudget({ total: 0, failed: 0, targetAvailability: 0.999 }).state).toBe("unmeasured");
    expect(errorBudget({ total: 10_000, failed: 1, targetAvailability: 0.999 }).state).toBe("healthy");
    expect(errorBudget({ total: 1_000, failed: 2, targetAvailability: 0.999 }).state).toBe("exhausted");
  });

  it("rejects inverted or unbounded tenant cost limits", () => {
    expect(operationalBudgetSchema.safeParse({ service: "commerce", softLimitMicros: 1_000_000, hardLimitMicros: 2_000_000, enabled: true }).success).toBe(true);
    expect(operationalBudgetSchema.safeParse({ service: "commerce", softLimitMicros: 2_000_000, hardLimitMicros: 1_000_000, enabled: true }).success).toBe(false);
  });
});
