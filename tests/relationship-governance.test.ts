import { describe, expect, it } from "vitest";
import {
  effectiveRelationshipConsent,
  recordRelationshipConsentSchema,
  relationshipConsentAllowsMessaging,
  reviewRelationshipMemorySchema,
} from "../server/relationship-governance";

describe("Relationship Hub human governance", () => {
  it("requires specific evidence before an operator records granted consent", () => {
    expect(() => recordRelationshipConsentSchema.parse({ channel: "native", status: "granted", evidenceNote: "yes" })).toThrow();
    expect(recordRelationshipConsentSchema.parse({ channel: "native", status: "granted", evidenceNote: "Explicit opt-in received in the support thread." }).status).toBe("granted");
  });

  it("uses the latest reviewed consent state and blocks denied or withdrawn messaging", () => {
    const older = { status: "granted", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };
    const latest = { status: "withdrawn", createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-03") };
    expect(effectiveRelationshipConsent([older, latest])).toBe(latest);
    expect(relationshipConsentAllowsMessaging(latest.status)).toBe(false);
    expect(relationshipConsentAllowsMessaging("denied")).toBe(false);
    expect(relationshipConsentAllowsMessaging("unknown")).toBe(true);
  });

  it("accepts only explicit memory review decisions", () => {
    expect(reviewRelationshipMemorySchema.parse({ decision: "accept" }).decision).toBe("accept");
    expect(() => reviewRelationshipMemorySchema.parse({ decision: "publish" })).toThrow();
  });
});
