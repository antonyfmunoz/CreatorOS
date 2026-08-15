import { describe, expect, it } from "vitest";
import { discoveryPolicySchema, discoveryPreferenceSchema, feedModes } from "../shared/discovery";

describe("search and discovery contracts", () => {
  it("exposes separate governed feed modes", () => { expect(feedModes).toEqual(["following", "chronological", "recommended"]); });
  it("rejects unsafe policy bounds and normalizes interests", () => {
    expect(discoveryPolicySchema.safeParse({ key: "native_feed", version: 1, weights: { recency: 2, engagement: 2, relationship: 2, interest: 2, quality: 2 }, guardrails: { maxPerCreator: 0, candidateWindow: 200, sensitivePenalty: 0.5, diversityTopics: true, minimumCreatorShare: 0.02 } }).success).toBe(false);
    const preference = discoveryPreferenceSchema.parse({ interests: ["Video", "video"], hiddenCreatorIds: [], sensitiveContent: "reduce" }); expect(preference.interests).toEqual(["video"]);
  });
});
