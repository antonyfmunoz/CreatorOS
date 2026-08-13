import { describe, expect, it } from "vitest";
import { applyBroadcastBrandKit, applyBroadcastScenePreset, applyBroadcastSourcePreset, broadcastSessionStartSchema, createBroadcastSceneFromTemplate, defaultBroadcastStudioConfig, duplicateBroadcastScene, removeBroadcastScenePreset, removeBroadcastSourcePreset, saveBroadcastScenePreset, saveBroadcastSourcePreset, transitionBroadcastScene, validateBroadcastStudioConfig } from "../shared/broadcast-studio";
import { buildBroadcastTeeOutput, isPrivateBroadcastAddress, maskBroadcastDestinationUrl } from "../server/broadcast-studio";

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
    expect(() => validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, audioProcessing: { ...source.audioProcessing, highPassHz: 2_000 } }] }] })).toThrow();
    expect(validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, audioProcessing: { highPassHz: 100, lowPassHz: 12_000, compressor: true, monitor: true } }] }] }).scenes[0].sources[0].audioProcessing).toEqual({ highPassHz: 100, lowPassHz: 12_000, compressor: true, monitor: true, routeToProgram: true, bus: "dialogue", syncOffsetMs: 0, stereoBalance: 0, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    expect(() => validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, audioProcessing: { ...source.audioProcessing, syncOffsetMs: 2_001 } }] }] })).toThrow();
    expect(() => validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, audioProcessing: { ...source.audioProcessing, stereoBalance: -1.1 } }] }] })).toThrow();
    expect(() => validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, chromaKey: { ...source.chromaKey, smoothness: 0.8 } }] }] })).toThrow();
    expect(validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, chromaKey: { enabled: true, color: "#00ff00", similarity: 0.4, smoothness: 0.15 } }] }] }).scenes[0].sources[0].chromaKey.enabled).toBe(true);
  });

  it("persists bounded named audio submixes and source assignments", () => {
    const base = defaultBroadcastStudioConfig();
    const source = base.scenes[0].sources[0];
    const mixed = validateBroadcastStudioConfig({
      ...base,
      audioBuses: base.audioBuses.map((bus) => bus.id === "music" ? { ...bus, name: "Score", gain: 0.4, muted: true } : bus),
      scenes: [{ ...base.scenes[0], sources: [{ ...source, audioProcessing: { ...source.audioProcessing, bus: "music" } }] }],
    });
    expect(mixed.audioBuses.find((bus) => bus.id === "music")).toMatchObject({ name: "Score", gain: 0.4, muted: true });
    expect(mixed.scenes[0].sources[0].audioProcessing.bus).toBe("music");
    expect(() => validateBroadcastStudioConfig({ ...base, audioBuses: base.audioBuses.map((bus) => ({ ...bus, gain: 2.1 })) })).toThrow();
  });

  it("accepts production overlay entrance presets", () => {
    const base = defaultBroadcastStudioConfig();
    const source = base.scenes[0].sources[0];
    for (const animation of ["fade", "slide", "rise", "wipe", "pop", "pulse"] as const) {
      const configured = validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, presentation: { ...source.presentation, animation } }] }] });
      expect(configured.scenes[0].sources[0].presentation.animation).toBe(animation);
    }
  });

  it("rejects internal destination addresses and never exposes URL credentials", () => {
    expect(isPrivateBroadcastAddress("127.0.0.1")).toBe(true);
    expect(isPrivateBroadcastAddress("10.1.2.3")).toBe(true);
    expect(isPrivateBroadcastAddress("192.168.1.2")).toBe(true);
    expect(isPrivateBroadcastAddress("8.8.8.8")).toBe(false);
    expect(maskBroadcastDestinationUrl("rtmps://user:secret@example.com/live?key=secret")).toBe("rtmps://example.com/live");
  });

  it("supports portrait and square profiles plus multi-destination sessions", () => {
    const base = defaultBroadcastStudioConfig();
    expect(validateBroadcastStudioConfig({ ...base, canvas: { width: 1080, height: 1920, fps: 30 } }).canvas).toMatchObject({ width: 1080, height: 1920 });
    expect(validateBroadcastStudioConfig({ ...base, canvas: { width: 1080, height: 1080, fps: 30 } }).canvas).toMatchObject({ width: 1080, height: 1080 });
    expect(() => validateBroadcastStudioConfig({ ...base, canvas: { width: 1920, height: 1920, fps: 30 } })).toThrow(/production profile/i);
    const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
    expect(broadcastSessionStartSchema.parse({ outputMode: "stream", destinationIds: ids, sourceMode: "browser" }).destinationIds).toEqual(ids);
  });

  it("isolates destination failures inside a single encoded fan-out", () => {
    const output = buildBroadcastTeeOutput([
      { protocol: "rtmps", url: "rtmps://video.example/live/key" },
      { protocol: "srt", url: "srt://video-two.example:9000?streamid=key" },
    ]);
    expect(output).toContain("[f=flv:onfail=ignore]rtmps://video.example/live/key");
    expect(output).toContain("[f=mpegts:onfail=ignore]srt://video-two.example:9000?streamid=key");
    expect(output.split("|")).toHaveLength(2);
    expect(buildBroadcastTeeOutput([{ protocol: "rtmp", url: "rtmp://video.example/live/key|backup" }])).toContain("key\\|backup");
  });

  it("creates reusable production scenes and applies a persistent brand kit", () => {
    const base = validateBroadcastStudioConfig({ ...defaultBroadcastStudioConfig(), brandKit: { primaryColor: "#ff0055", surfaceColor: "#221122", textColor: "#fefefe", logoAssetId: null } });
    const interview = createBroadcastSceneFromTemplate(base, "interview", "scene_interview");
    const scene = interview.scenes.at(-1)!;
    expect(scene.name).toBe("Two-person interview");
    expect(scene.sources.filter((source) => source.type === "camera")).toHaveLength(2);
    expect(scene.sources.find((source) => source.presentation?.style === "lower_third")).toMatchObject({ color: "#fefefe", presentation: { backgroundColor: "#221122" } });
    const branded = applyBroadcastBrandKit(validateBroadcastStudioConfig({ ...interview, brandKit: { ...interview.brandKit, surfaceColor: "#0055ff" } }));
    expect(branded.scenes.at(-1)?.sources.find((source) => source.presentation?.style === "lower_third")?.presentation?.backgroundColor).toBe("#0055ff");
    expect(scene.sources.find((source) => source.presentation?.style === "lower_third")?.presentation).toMatchObject({ animation: "slide", animationSpeed: 1 });
  });

  it("saves, reapplies, and removes render-effective source presets", () => {
    const base = defaultBroadcastStudioConfig();
    const saved = saveBroadcastSourcePreset(base, "source_title", "preset_title", "Launch title");
    expect(saved.sourcePresets).toEqual([expect.objectContaining({ id: "preset_title", name: "Launch title", source: expect.objectContaining({ type: "text", text: "CreativesOS Live" }) })]);
    const applied = applyBroadcastSourcePreset(saved, "scene_main", "preset_title", "source_reused");
    expect(applied.scenes[0].sources.at(-1)).toMatchObject({ id: "source_reused", name: "Launch title", text: "CreativesOS Live", locked: false });
    expect(removeBroadcastSourcePreset(applied, "preset_title").sourcePresets).toEqual([]);
  });

  it("saves, instantiates, and removes complete reusable scene presets", () => {
    const base = createBroadcastSceneFromTemplate(defaultBroadcastStudioConfig(), "interview", "scene_interview");
    const saved = saveBroadcastScenePreset(base, "scene_interview", "preset_interview", "Weekly interview");
    expect(saved.scenePresets[0]).toMatchObject({ name: "Weekly interview", scene: { name: "Two-person interview" } });
    const applied = applyBroadcastScenePreset(saved, "preset_interview", "scene_weekly");
    expect(applied.scenes.at(-1)).toMatchObject({ id: "scene_weekly", name: "Weekly interview" });
    expect(new Set(applied.scenes.at(-1)!.sources.map((source) => source.id)).size).toBe(applied.scenes.at(-1)!.sources.length);
    expect(removeBroadcastScenePreset(applied, "preset_interview").scenePresets).toEqual([]);
  });
});
