import { describe, expect, it } from "vitest";
import {
  communityLevelForPoints,
  replaceCommunityOnboardingSchema,
  validateCommunityAnswer,
} from "../shared/community-engagement";

describe("community onboarding and gamification contract", () => {
  it("accepts a bounded guided flow and rejects selection questions without choices", () => {
    expect(
      replaceCommunityOnboardingSchema.safeParse({
        questions: [
          {
            prompt: "What are you building?",
            kind: "text",
            options: [],
            required: true,
          },
          {
            prompt: "Choose your focus",
            kind: "single_select",
            options: [
              { id: "audience", label: "Audience" },
              { id: "revenue", label: "Revenue" },
            ],
            required: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      replaceCommunityOnboardingSchema.safeParse({
        questions: [
          {
            prompt: "Choose your focus",
            kind: "single_select",
            options: [],
            required: true,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates required answers against the question's allowed options", () => {
    const question = {
      kind: "single_select" as const,
      options: [
        { id: "planning", label: "Planning" },
        { id: "publishing", label: "Publishing" },
      ],
      required: true,
    };
    expect(validateCommunityAnswer(question, "planning")).toBe(true);
    expect(validateCommunityAnswer(question, "unknown")).toBe(false);
    expect(validateCommunityAnswer(question, undefined)).toBe(false);
  });

  it("computes deterministic levels and progress boundaries", () => {
    expect(communityLevelForPoints(0)).toMatchObject({
      level: 1,
      pointsToNext: 25,
    });
    expect(communityLevelForPoints(75)).toMatchObject({
      level: 3,
      pointsToNext: 75,
    });
    expect(communityLevelForPoints(2_500)).toMatchObject({
      level: 8,
      pointsToNext: 0,
    });
  });
});
