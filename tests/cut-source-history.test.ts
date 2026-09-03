import { describe, expect, it } from "vitest";
import { CutSourceHistory, type CutSourceSnapshot } from "../client/src/lib/cut-source-history";

const snapshot = (content: string): CutSourceSnapshot => ({ entrypoint: "src/index.tsx", files: [{ path: "src/index.tsx", content }] });
describe("bounded source editor history", () => {
  it("restores exact text, added/removed files and entrypoint without save metadata", () => {
    const history = new CutSourceHistory(); const a = snapshot("A");
    const b = { entrypoint: "src/Second.tsx", files: [...a.files, { path: "src/Second.tsx", content: "🎬\uFEFF" }] };
    history.record(a, b); expect(history.undo(b)).toEqual(a); expect(history.canRedo).toBe(true);
    expect(history.redo(a)).toEqual(b); expect(history.canRedo).toBe(false);
  });
  it("does not keep aliases to caller-owned mutable arrays or restore save receipts", () => {
    const history = new CutSourceHistory(); const a = { ...snapshot("A"), saved: "not a history field" }; const b = snapshot("B");
    history.record(a, b); a.files[0].content = "mutated";
    const undone = history.undo(b)!; expect(undone).toEqual(snapshot("A")); expect(undone).not.toHaveProperty("saved");
    undone.files[0].content = "changed after return";
    expect(history.redo(snapshot("A"))).toEqual(b);
  });
  it("retains redo through no-op save/view updates but clears it on a new edit", () => {
    const history = new CutSourceHistory(); const a = snapshot("A"), b = snapshot("B"), c = snapshot("C");
    history.record(a, b); history.undo(b); history.record(a, snapshot("A")); expect(history.canRedo).toBe(true);
    history.record(a, c); expect(history.canRedo).toBe(false); expect(history.undo(c)).toEqual(a);
  });
  it("evicts oldest steps without losing the current source", () => {
    const history = new CutSourceHistory(2); const a = snapshot("A"), b = snapshot("B"), c = snapshot("C"), d = snapshot("D");
    history.record(a, b); history.record(b, c); history.record(c, d);
    expect(history.undo(d)).toEqual(c); expect(history.undo(c)).toEqual(b); expect(history.undo(b)).toBeNull();
    expect(history.redo(b)).toEqual(c); expect(history.redo(c)).toEqual(d);
  });
  it("caps retained text on both undo and redo, including unusually large edits", () => {
    const history = new CutSourceHistory(40, 1000); const small = snapshot("A"), large = snapshot("X".repeat(1000));
    history.record(small, large); expect(history.undo(large)).toEqual(small); expect(history.retainedBytes).toBeLessThanOrEqual(1000);
    expect(history.canRedo).toBe(false); expect(large.files[0].content).toHaveLength(1000);
    history.record(large, small); expect(history.canUndo).toBe(false);
  });
  it("forgets previous package/project contents on reset", () => {
    const history = new CutSourceHistory(); history.record(snapshot("old"), snapshot("new")); history.reset();
    expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(false); expect(history.retainedBytes).toBe(0);
    expect(() => new CutSourceHistory(0)).toThrow(/positive/);
  });
});
