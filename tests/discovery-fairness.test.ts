import { describe, expect, it } from "vitest";
import { discoveryPolicySchema, selectDiverseDiscoveryCandidates } from "../shared/discovery";

describe("discovery fairness guardrails", () => {
  it("bounds creator concentration and preserves topic diversity over a large deterministic cohort", () => {
    const candidates = Array.from({ length: 10_000 }, (_, index) => ({
      id: index + 1,
      creatorId: (index % 500) + 1,
      topic: ["video", "business", "design", "community"][index % 4],
      protectedAttribute: index % 2 ? "cohort-a" : "cohort-b",
    }));
    const selected = selectDiverseDiscoveryCandidates(candidates, {
      limit: 200,
      maxPerCreator: 2,
      diversityTopics: true,
      creatorId: (candidate) => candidate.creatorId,
      topic: (candidate) => candidate.topic,
      pinned: candidates[0],
    });
    expect(selected).toHaveLength(200);
    const creatorCounts = new Map<number, number>();
    selected.forEach((candidate) => creatorCounts.set(candidate.creatorId, (creatorCounts.get(candidate.creatorId) ?? 0) + 1));
    expect(Math.max(...creatorCounts.values())).toBeLessThanOrEqual(2);
    for (let index = 1; index < selected.length; index += 1) expect(selected[index].topic).not.toBe(selected[index - 1].topic);
    expect(selectDiverseDiscoveryCandidates(candidates, {
      limit: 200,
      maxPerCreator: 2,
      diversityTopics: true,
      creatorId: (candidate) => candidate.creatorId,
      topic: (candidate) => candidate.topic,
      pinned: candidates[0],
    }).map((candidate) => candidate.id)).toEqual(selected.map((candidate) => candidate.id));
  });

  it("rejects undeclared ranking inputs instead of silently accepting protected traits", () => {
    const policy = {
      key: "native_feed",
      version: 1,
      weights: { recency: 1, engagement: 1, relationship: 1, interest: 1, quality: 1, protectedAttribute: 10 },
      guardrails: { maxPerCreator: 2, candidateWindow: 200, sensitivePenalty: 0.25, diversityTopics: true, minimumCreatorShare: 0.02 },
    };
    expect(discoveryPolicySchema.safeParse(policy).success).toBe(false);
  });
});
