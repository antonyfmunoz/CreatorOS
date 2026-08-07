import { describe, expect, it } from "vitest";
import { reconcileCommunitySelection } from "../client/src/lib/community-selection";

describe("community selection", () => {
  const communities = [{ id: 8 }, { id: 11 }];

  it("keeps a valid current selection", () => {
    expect(reconcileCommunitySelection(11, communities)).toBe(11);
  });

  it("replaces a stale selection with the first live community", () => {
    expect(reconcileCommunitySelection(1, communities)).toBe(8);
  });

  it("clears selection when no communities remain", () => {
    expect(reconcileCommunitySelection(8, [])).toBeNull();
  });
});
