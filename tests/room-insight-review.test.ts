import { describe, expect, it } from "vitest";
import {
  acceptedRoomInsightContent,
  roomInsightReviewInputSchema,
} from "../server/room-intelligence-policy";

describe("room insight human review", () => {
  it("accepts only the three explicit review decisions", () => {
    expect(
      roomInsightReviewInputSchema.parse({ decision: "accept_note" }),
    ).toEqual({ decision: "accept_note" });
    expect(
      roomInsightReviewInputSchema.parse({
        decision: "accept_action",
        assigneeUserId: 42,
        dueAt: "2026-08-12T00:00:00.000Z",
      }),
    ).toMatchObject({ decision: "accept_action", assigneeUserId: 42 });
    expect(roomInsightReviewInputSchema.parse({ decision: "dismiss" })).toEqual(
      { decision: "dismiss" },
    );
    expect(
      roomInsightReviewInputSchema.safeParse({ decision: "publish" }).success,
    ).toBe(false);
  });

  it("preserves the reviewed title and evidence-backed body", () => {
    expect(
      acceptedRoomInsightContent({
        title: "  Confirm the next step ",
        body: " The guest asked for a written follow-up. ",
      }),
    ).toBe("Confirm the next step\n\nThe guest asked for a written follow-up.");
  });
});
