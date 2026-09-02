import { describe, expect, it } from "vitest";
import { cutImageFit } from "../shared/cut-image-fit";
import { cutGraphicSchema } from "../shared/cut-studio";
import { compileCompositionToEdl } from "../shared/cut-studio-production";
import { createHash } from "node:crypto";
import { captureCutRenderTimeline, resolveCutRenderTimeline } from "../server/cut-render-snapshot";

describe("authored image framing", () => {
  it("retains the cover composition default and admits only explicit supported fits", () => {
    expect(cutImageFit(undefined)).toBe("cover");
    for (const fit of ["cover", "contain", "fill"]) expect(cutImageFit(fit)).toBe(fit);
    for (const fit of ["scale-down", "url(https://example.com)", 3, {}]) expect(() => cutImageFit(fit)).toThrow(/Image framing/);
  });
  it("keeps legacy EDL image framing while compiling all authored modes explicitly", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const legacy = cutGraphicSchema.parse({ id: "image", kind: "image", assetId: id, text: "", timelineStart: 0, duration: 1 });
    expect(legacy.imageFit).toBeUndefined();
    expect(Object.hasOwn(legacy, "imageFit")).toBe(false);
    for (const fit of [undefined, "cover", "contain", "fill"]) {
      const edl = compileCompositionToEdl({ version: 1, name: "Image framing", width: 480, height: 270, fps: 30, durationInFrames: 30, layers: [
        { id: "source", name: "Source", kind: "video", assetId: id, from: 0, durationInFrames: 30 },
        { id: "image", name: "Image", kind: "image", assetId: id, from: 0, durationInFrames: 30, style: fit ? { objectFit: fit } : {} },
      ] }, { version: 3, clips: [] });
      expect(edl.graphics?.[0].imageFit).toBe(fit ?? "cover");
    }
  });
  it("resolves an older queued snapshot without inserting an image-fit hash change", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const graphic = cutGraphicSchema.parse({ id: "image", kind: "image", assetId: id, text: "", timelineStart: 0, duration: 1 });
    const project = { id, sourceAssetId: id, revision: 1, name: "Legacy snapshot", duration: 1, transcript: null, edl: { version: 3 as const, clips: [{ start: 0, end: 1 }], graphics: [graphic] } };
    const snapshot = captureCutRenderTimeline(project);
    const { sha256: _digest, ...legacyData } = JSON.parse(JSON.stringify(snapshot));
    delete legacyData.edl.graphics[0].imageFit;
    const oldSnapshot = { ...legacyData, sha256: createHash("sha256").update(JSON.stringify(legacyData)).digest("hex") };
    expect(resolveCutRenderTimeline(project, oldSnapshot).edl.graphics?.[0].imageFit).toBeUndefined();
    expect(() => resolveCutRenderTimeline(project, { ...oldSnapshot, edl: { ...legacyData.edl, graphics: [{ ...graphic, imageFit: "cover" }] } })).toThrow(/content receipt/);
  });
});
