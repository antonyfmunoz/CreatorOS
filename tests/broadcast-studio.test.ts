import { describe, expect, it } from "vitest";
import { defaultBroadcastStudioConfig, duplicateBroadcastScene, transitionBroadcastScene, validateBroadcastStudioConfig } from "../shared/broadcast-studio";
import { isPrivateBroadcastAddress, maskBroadcastDestinationUrl } from "../server/broadcast-studio";

describe("CreativesOS Broadcast scene graph", () => {
  it("starts with an independently owned preview/program scene", () => {
    const config = defaultBroadcastStudioConfig();
    expect(config.version).toBe(1);
    expect(config.previewSceneId).toBe(config.programSceneId);
    expect(config.scenes[0].sources[0]).toMatchObject({ type: "text", text: "CreativesOS Live" });
  });

  it("transitions preview to program without mutating a destination", () => {
    const base = defaultBroadcastStudioConfig();
    const second = duplicateBroadcastScene(base, base.programSceneId, "scene_second");
    expect(second.previewSceneId).toBe("scene_second");
    expect(transitionBroadcastScene(second).programSceneId).toBe("scene_second");
  });

  it("rejects missing scenes, duplicate source identifiers, and off-canvas sources", () => {
    const base = defaultBroadcastStudioConfig();
    expect(() => validateBroadcastStudioConfig({ ...base, previewSceneId: "missing" })).toThrow(/existing scene/i);
    const duplicate = { ...base, scenes: [{ ...base.scenes[0], sources: [base.scenes[0].sources[0], base.scenes[0].sources[0]] }] };
    expect(() => validateBroadcastStudioConfig(duplicate)).toThrow(/duplicate source/i);
    const offCanvas = { ...base, scenes: [{ ...base.scenes[0], sources: [{ ...base.scenes[0].sources[0], transform: { ...base.scenes[0].sources[0].transform, x: .8, width: .5 } }] }] };
    expect(() => validateBroadcastStudioConfig(offCanvas)).toThrow(/inside the canvas/i);
  });

  it("bounds production controls and visual filters", () => {
    const base = defaultBroadcastStudioConfig();
    const source = base.scenes[0].sources[0];
    expect(() => validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, volume: 3 }] }] })).toThrow();
    expect(() => validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, filters: { ...source.filters, blurPx: 50 } }] }] })).toThrow();
  });

  it("rejects internal destination addresses and never exposes URL credentials", () => {
    expect(isPrivateBroadcastAddress("127.0.0.1")).toBe(true);
    expect(isPrivateBroadcastAddress("10.1.2.3")).toBe(true);
    expect(isPrivateBroadcastAddress("192.168.1.2")).toBe(true);
    expect(isPrivateBroadcastAddress("8.8.8.8")).toBe(false);
    expect(maskBroadcastDestinationUrl("rtmps://user:secret@example.com/live?key=secret")).toBe("rtmps://example.com/live");
  });
});
