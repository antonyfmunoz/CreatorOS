import { describe, expect, it } from "vitest";
import {
  errorBudget,
  operationalBudgetSchema,
  operationalServiceLevels,
} from "../shared/operations";

describe("operations control plane contract", () => {
  it("publishes bounded objectives for every desired-state workload", () => {
    expect(operationalServiceLevels.map((item) => item.service)).toEqual([
      "playback", "messaging", "automation", "commerce", "realtime", "developer_api", "webhooks",
    ]);
    expect(operationalServiceLevels.every((item) => item.targetAvailability >= 0.995 && item.targetAvailability < 1)).toBe(true);
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
