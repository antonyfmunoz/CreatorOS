import { describe, expect, it } from "vitest";
import { normalizePostLocation } from "../server/post-location";

describe("post location", () => {
  it("extracts and normalizes the current composer payload", () => {
    expect(normalizePostLocation(JSON.stringify({ name: "  Los   Angeles, CA ", distance: "fake" }))).toBe("Los Angeles, CA");
  });

  it("accepts plain text and rejects empty input", () => {
    expect(normalizePostLocation("Brooklyn, New York")).toBe("Brooklyn, New York");
    expect(normalizePostLocation("   ")).toBeNull();
  });
});
