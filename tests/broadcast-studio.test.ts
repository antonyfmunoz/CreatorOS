import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyBroadcastBrandKit, applyBroadcastScenePreset, applyBroadcastSourcePreset, broadcastDestinationInputSchema, broadcastSessionStartSchema, createBroadcastSceneFromTemplate, defaultBroadcastStudioConfig, duplicateBroadcastScene, removeBroadcastScenePreset, removeBroadcastSourcePreset, saveBroadcastScenePreset, saveBroadcastSourcePreset, transitionBroadcastScene, validateBroadcastStudioConfig } from "../shared/broadcast-studio";
import { broadcastOutputDimensions, buildBroadcastTeeOutput, buildBroadcastVariantFilters, buildBroadcastVariantPlan, isPrivateBroadcastAddress, maskBroadcastDestinationUrl } from "../server/broadcast-studio";

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

  it("supports bounded operator transitions beyond a cut or dissolve", () => {
    const base = defaultBroadcastStudioConfig();
    for (const type of ["fade", "dip", "wipe", "slide"] as const) {
      expect(validateBroadcastStudioConfig({ ...base, transition: { type, durationMs: 750 } }).transition).toEqual({ type, durationMs: 750 });
    }
    expect(() => validateBroadcastStudioConfig({ ...base, transition: { type: "spin", durationMs: 750 } })).toThrow();
  });

  it("persists provider-neutral audience, goal, sponsor, and tipping widgets", () => {
    const base = defaultBroadcastStudioConfig();
    const source = base.scenes[0].sources[0];
    const configured = validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, type: "widget", text: null, muted: true, widget: { kind: "tip_jar", title: "Support the show", value: 425, target: 1_000, currency: "USD", maxItems: 3 } }] }] });
    expect(configured.scenes[0].sources[0].widget).toEqual({ kind: "tip_jar", title: "Support the show", value: 425, target: 1_000, currency: "USD", maxItems: 3 });
    expect(() => validateBroadcastStudioConfig({ ...base, scenes: [{ ...base.scenes[0], sources: [{ ...source, type: "widget", widget: { kind: "tip_jar", title: "Broken", value: 2, target: 0, currency: "usd", maxItems: 3 } }] }] })).toThrow();
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
    expect(broadcastDestinationInputSchema.parse({ name: "Main", protocol: "rtmps", ingestUrl: "rtmps://video.example/live", streamKey: "secret" })).toMatchObject({ outputLayout: "program", framingMode: "fit" });
    expect(broadcastDestinationInputSchema.parse({ name: "Vertical", protocol: "rtmps", ingestUrl: "rtmps://video.example/live", streamKey: "secret", outputLayout: "portrait", framingMode: "fill" })).toMatchObject({ outputLayout: "portrait", framingMode: "fill" });
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

  it("deduplicates independently framed destination encodes", () => {
    expect(broadcastOutputDimensions("program", { width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
    expect(broadcastOutputDimensions("portrait", { width: 1280, height: 720 })).toEqual({ width: 1080, height: 1920 });
    const plan = buildBroadcastVariantPlan([
      { outputLayout: "program", framingMode: "fit" },
      { outputLayout: "portrait", framingMode: "fill" },
      { outputLayout: "portrait", framingMode: "fill" },
      { outputLayout: "square", framingMode: "fit" },
    ], { width: 1280, height: 720 });
    expect(plan.variants).toEqual([
      expect.objectContaining({ key: "1280x720:fit", width: 1280, height: 720, framingMode: "fit" }),
      expect.objectContaining({ key: "1080x1920:fill", width: 1080, height: 1920, framingMode: "fill" }),
      expect.objectContaining({ key: "1080x1080:fit", width: 1080, height: 1080, framingMode: "fit" }),
    ]);
    expect(plan.destinationVariantIndexes).toEqual([0, 1, 1, 2]);
    const filters = buildBroadcastVariantFilters(plan.variants);
    expect(filters.videoMaps).toEqual(["[variant_0]", "[variant_1]", "[variant_2]"]);
    expect(filters.filterComplex).toContain("split=3[variant_input_0][variant_input_1][variant_input_2]");
    expect(filters.filterComplex).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(filters.filterComplex).toContain("scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080");
    expect(buildBroadcastTeeOutput([{ protocol: "rtmps", url: "rtmps://video.example/live/key", videoStreamIndex: 2 }])).toContain("select='v\\:2,a\\:0'");
    expect(() => buildBroadcastVariantPlan([{ outputLayout: "cinema", framingMode: "fit" }], { width: 1280, height: 720 })).toThrow();
  });

  it("executes the independent fit and fill filter graph in FFmpeg", () => {
    const filters = buildBroadcastVariantFilters([
      { framingMode: "fit", width: 320, height: 180 },
      { framingMode: "fill", width: 180, height: 320 },
    ]);
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=1",
      "-filter_complex", filters.filterComplex,
      "-map", filters.videoMaps[0], "-map", filters.videoMaps[1],
      "-frames:v", "1", "-f", "null", "-",
    ], { encoding: "utf8", windowsHide: true });
    expect(result.status, result.stderr).toBe(0);
  });

  it("encodes horizontal and vertical tee outputs from one program input", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "creativesos-dual-output-"));
    try {
      const filters = buildBroadcastVariantFilters([
        { framingMode: "fit", width: 320, height: 180 },
        { framingMode: "fill", width: 180, height: 320 },
      ]);
      const tee = buildBroadcastTeeOutput([
        { protocol: "rtmp", url: "landscape.flv", videoStreamIndex: 0 },
        { protocol: "rtmp", url: "portrait.flv", videoStreamIndex: 1 },
      ]);
      const encoded = spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=5:duration=1",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
        "-filter_complex", filters.filterComplex,
        "-map", filters.videoMaps[0], "-map", filters.videoMaps[1], "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-f", "tee", tee,
      ], { cwd: workspace, encoding: "utf8", windowsHide: true });
      expect(encoded.status, encoded.stderr).toBe(0);
      expect(statSync(path.join(workspace, "landscape.flv")).size).toBeGreaterThan(0);
      expect(statSync(path.join(workspace, "portrait.flv")).size).toBeGreaterThan(0);
      for (const [filename, expected] of [["landscape.flv", "320,180"], ["portrait.flv", "180,320"]] as const) {
        const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", filename], { cwd: workspace, encoding: "utf8", windowsHide: true });
        expect(probe.status, probe.stderr).toBe(0);
        expect(probe.stdout.trim()).toBe(expected);
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
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
