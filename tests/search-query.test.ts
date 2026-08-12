import { describe, expect, it } from "vitest";
import { normalizeSearchQuery } from "../server/search-query";

describe("search query normalization", () => {
  it("trims and bounds public search input", () => {
    expect(normalizeSearchQuery("  creator strategy  ")).toBe("creator strategy");
    expect(normalizeSearchQuery(undefined)).toBe("");
    expect(normalizeSearchQuery("x".repeat(150))).toHaveLength(120);
  });
});
