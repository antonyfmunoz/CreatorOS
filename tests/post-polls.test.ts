import { describe, expect, it } from "vitest";
import { normalizePostPoll } from "../server/post-polls";

describe("post polls", () => {
  it("normalizes current text and media composer payloads", () => {
    expect(normalizePostPoll({ question: "  Best   format? ", options: [" Video ", "Audio"] })).toEqual({ question: "Best format?", options: ["Video", "Audio"] });
    expect(normalizePostPoll(JSON.stringify({ question: "Pick one", options: ["A", "B"] }))).toEqual({ question: "Pick one", options: ["A", "B"] });
  });

  it("rejects duplicate or underspecified options", () => {
    expect(() => normalizePostPoll({ question: "Pick", options: ["Same", "same"] })).toThrow("unique");
    expect(() => normalizePostPoll({ question: "Pick", options: ["Only"] })).toThrow("between 2 and 4");
  });
});
