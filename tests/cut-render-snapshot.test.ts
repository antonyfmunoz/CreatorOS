import { describe, expect, it } from "vitest";
import { captureCutRenderTimeline, resolveCutRenderTimeline } from "../server/cut-render-snapshot";
import { cutRenderRequestSchema, type CutEdl, type CutTranscript } from "../shared/cut-studio";

const original = () => ({ id: "00000000-0000-4000-8000-000000000001", sourceAssetId: "00000000-0000-4000-8000-000000000002", name: "Submitted edit", revision: 3, duration: 3, edl: { version: 1, clips: [{ id: "first", start: 0, end: 3, volume: .5 }] } as CutEdl, transcript: { duration: 3, language: "en", segments: [{ id: "first", start: 0, end: 3, text: "Original words", words: [] }] } as CutTranscript | null, ownerUserId: 8 });
describe("immutable timeline render admission", () => {
  it("freezes edits, captions, name and revision while preserving live authorization", () => {
    const project = original(); const snapshot = captureCutRenderTimeline(project);
    project.edl.clips[0].end = 1; project.transcript!.segments[0].text = "Later words";
    project.name = "Later edit"; project.revision = 4;
    const resolved = resolveCutRenderTimeline(project, snapshot);
    expect(resolved).toMatchObject({ name: "Submitted edit", revision: 3, ownerUserId: 8, edl: { clips: [{ end: 3, volume: .5 }] }, transcript: { segments: [{ text: "Original words" }] } });
    expect(project.edl.clips[0].end).toBe(1);
    expect(cutRenderRequestSchema.parse({ timeline: snapshot }).timeline?.sha256).toBe(snapshot.sha256);
  });
  it("binds every captured value and rejects corruption or a different project/source", () => {
    const project = original(); const snapshot = captureCutRenderTimeline(project);
    for (const patch of [{ revision: 4 }, { name: "Changed" }, { transcript: null }, { duration: 5 }, { sha256: "0".repeat(64) }, { edl: { version: 1, clips: [{ start: 0, end: 1 }] } }]) expect(() => resolveCutRenderTimeline(project, { ...snapshot, ...patch })).toThrow();
    expect(() => resolveCutRenderTimeline({ ...project, id: "00000000-0000-4000-8000-000000000003" }, snapshot)).toThrow();
    expect(() => resolveCutRenderTimeline({ ...project, sourceAssetId: "00000000-0000-4000-8000-000000000003" }, snapshot)).toThrow();
  });
  it("has stable receipts across serialization and rejects ambiguous snapshot modes", () => {
    const snapshot = captureCutRenderTimeline(original());
    expect(resolveCutRenderTimeline(original(), JSON.parse(JSON.stringify(snapshot))).name).toBe("Submitted edit");
    expect(captureCutRenderTimeline(original()).sha256).toBe(snapshot.sha256);
    expect(() => cutRenderRequestSchema.parse({ timeline: snapshot, composition: { id: original().id, revision: 1, name: "Composition", renderBatchId: "batch-test-123", variantIndex: 0, manifest: {} } })).toThrow(/not both/);
    expect(cutRenderRequestSchema.parse({}).timeline).toBeUndefined();
  });
});
