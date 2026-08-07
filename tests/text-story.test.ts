import { describe, expect, it } from "vitest";
import { buildTextStory, wantsStory } from "../server/text-story";

describe("text story publishing", () => {
  it("recognizes boolean and multipart-style story flags", () => {
    expect(wantsStory(true)).toBe(true);
    expect(wantsStory("true")).toBe(true);
    expect(wantsStory(false)).toBe(false);
    expect(wantsStory("false")).toBe(false);
  });

  it("builds a displayable text story and rejects empty content", () => {
    expect(buildTextStory(7, "  A durable story  ")).toEqual({
      userId: 7,
      mediaUrl: "",
      mediaType: "text",
      caption: "A durable story",
    });
    expect(() => buildTextStory(7, "   ")).toThrow("needs post content");
  });
});
