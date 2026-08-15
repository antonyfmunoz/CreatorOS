import { describe, expect, it } from "vitest";
import { canTransitionCreativeWork, createCreativeWorkItemSchema } from "../shared/planning";
describe("production planning contracts", () => {
  it("models the idea-to-retrospective lifecycle without skipping governance", () => { expect(canTransitionCreativeWork("idea", "brief")).toBe(true); expect(canTransitionCreativeWork("idea", "published")).toBe(false); expect(canTransitionCreativeWork("review", "scheduled")).toBe(true); expect(canTransitionCreativeWork("published", "retrospective")).toBe(true); });
  it("rejects impossible schedules", () => { expect(createCreativeWorkItemSchema.safeParse({ title: "Launch", kind: "campaign", startsAt: "2026-09-02", dueAt: "2026-09-01" }).success).toBe(false); });
});
