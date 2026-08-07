import { describe, expect, it } from "vitest";
import {
  isAuthorizedDistributionDispatch,
  isDistributionDispatchConfigured,
} from "../server/distribution-dispatch";

const configuredEnvironment = {
  DISTRIBUTION_DISPATCH_SECRET: "test-scheduler-secret",
};

describe("distribution scheduler authorization", () => {
  it("requires a non-empty configured secret", () => {
    expect(isDistributionDispatchConfigured({})).toBe(false);
    expect(
      isDistributionDispatchConfigured({ DISTRIBUTION_DISPATCH_SECRET: "  " }),
    ).toBe(false);
    expect(isDistributionDispatchConfigured(configuredEnvironment)).toBe(true);
  });

  it("accepts only the matching bearer secret", () => {
    expect(
      isAuthorizedDistributionDispatch(
        "Bearer test-scheduler-secret",
        configuredEnvironment,
      ),
    ).toBe(true);
    expect(
      isAuthorizedDistributionDispatch(
        "Bearer another-secret",
        configuredEnvironment,
      ),
    ).toBe(false);
    expect(isAuthorizedDistributionDispatch(undefined, configuredEnvironment)).toBe(
      false,
    );
  });
});
