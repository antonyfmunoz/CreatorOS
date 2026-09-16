import { describe, expect, it } from "vitest";
import {
  contentResearchBriefSchema,
  contentResearchBriefUpdateSchema,
} from "../shared/content-research";

describe("content research contract", () => {
  it("accepts a source-backed creator research brief", () => {
    const result = contentResearchBriefSchema.safeParse({
      topic: "Creator distribution workflows",
      audience: "Independent educators",
      objective: "Generate qualified video leads",
      angle: "One workflow from research through distribution",
      workingTitle: "Stop copying content between tools",
      draftText: "Create once. Distribute intentionally.",
      plannedFor: "2026-09-30T17:00:00.000Z",
      sources: [
        { label: "Creator report", url: "https://example.com/report" },
      ],
      competitors: [
        {
          name: "Example creator",
          platform: "YouTube",
          url: "https://youtube.com/example",
          observation: "Opens with a specific operational pain point.",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("requires a topic and rejects invalid evidence URLs", () => {
    expect(contentResearchBriefSchema.safeParse({ topic: "" }).success).toBe(false);
    expect(
      contentResearchBriefSchema.safeParse({
        topic: "Topic",
        sources: [{ label: "Untrusted", url: "not-a-url" }],
      }).success,
    ).toBe(false);
  });

  it("allows bounded partial updates but rejects an empty patch", () => {
    expect(contentResearchBriefUpdateSchema.safeParse({ angle: "A sharper hook" }).success).toBe(true);
    expect(contentResearchBriefUpdateSchema.safeParse({}).success).toBe(false);
  });
});
