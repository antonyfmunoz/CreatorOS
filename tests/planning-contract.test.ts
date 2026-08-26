import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canTransitionCreativeWork, createCreativeWorkItemSchema, transitionCreativeWorkItemSchema, updateCreativeWorkItemSchema } from "../shared/planning";
describe("production planning contracts", () => {
  it("models the idea-to-retrospective lifecycle without skipping governance", () => { expect(canTransitionCreativeWork("idea", "brief")).toBe(true); expect(canTransitionCreativeWork("idea", "published")).toBe(false); expect(canTransitionCreativeWork("review", "scheduled")).toBe(true); expect(canTransitionCreativeWork("published", "retrospective")).toBe(true); });
  it("rejects impossible schedules", () => { expect(createCreativeWorkItemSchema.safeParse({ title: "Launch", kind: "campaign", startsAt: "2026-09-02", dueAt: "2026-09-01" }).success).toBe(false); });
  it("accepts business-scoped hierarchy and optimistic task commands", () => {
    const parentWorkItemId = "48dccde9-69f7-4b40-bb4b-817d21987f91";
    expect(createCreativeWorkItemSchema.safeParse({ title: "Child", kind: "content", parentWorkItemId }).success).toBe(true);
    expect(updateCreativeWorkItemSchema.safeParse({ title: "Revised", parentWorkItemId, version: 2 }).success).toBe(true);
    expect(transitionCreativeWorkItemSchema.safeParse({ status: "review", version: 2 }).success).toBe(true);
  });
  it("ships replay-safe hierarchy and durable event migration", () => {
    const migration = readFileSync(new URL("../migrations/0111_task_conformance.sql", import.meta.url), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "parent_work_item_id"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "creative_work_events"');
    expect(migration).toContain("task.imported");
    expect(migration).toContain("WHERE NOT EXISTS");
  });
});
