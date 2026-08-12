import { describe, expect, it } from "vitest";
import { roomDueDateLabel } from "../client/src/lib/room-workspace";

describe("room workspace calendar dates", () => {
  it("preserves the selected UTC calendar day instead of shifting by viewer timezone", () => {
    expect(roomDueDateLabel("2026-08-11T00:00:00.000Z")).toContain("Aug 11");
  });

  it("ignores invalid or absent deadlines", () => {
    expect(roomDueDateLabel(null)).toBeNull();
    expect(roomDueDateLabel("not-a-date")).toBeNull();
  });
});
