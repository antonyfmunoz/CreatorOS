import { describe, expect, it } from "vitest";
import {
  compileCompositionToEdl,
  cutCodeCapsuleSchema,
  cutCompositionManifestSchema,
  cutGenerationProviderRegistry,
  cutGenerationRequestSchema,
  cutGenerativeWorkflowSchema,
  cutShotSpecSchema,
  evaluateCompositionFrame,
  expandNestedCompositionManifest,
  resolveCompositionParameters,
} from "../shared/cut-studio-production";
import { sanitizeCutStudioSvg } from "../shared/cut-studio-svg";
import { parseCutThreePrimitiveStyle, renderCutThreePrimitiveSvg } from "../shared/cut-studio-three";

const sourceAssetId = "00000000-0000-4000-8000-000000000001";
const sourceLayer = {
  id: "source",
  kind: "video" as const,
  name: "Source",
  from: 0,
  durationInFrames: 120,
  assetId: sourceAssetId,
  animations: [{ property: "x" as const, keyframes: [{ frame: 0, value: 0, easing: "linear" as const }, { frame: 60, value: 1, easing: "linear" as const }] }],
  effects: [{ id: "glow", kind: "glow" as const, enabled: true, parameters: { intensity: .5 } }],
};

const manifest = {
  version: 1 as const,
  name: "Programmable launch",
  width: 1920,
  height: 1080,
  fps: 30 as const,
  durationInFrames: 120,
  background: "#000000",
  layers: [sourceLayer, { id: "title", kind: "text" as const, name: "Title", from: 10, durationInFrames: 60, text: "Ship the story", x: .1, y: .7, rotation: -8, style: { fontSize: 72, color: "#ffffff" }, enter: { kind: "slide" as const, durationInFrames: 12, easing: "spring" as const, direction: "right" as const }, animations: [{ property: "scale" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 45, value: 1.4 }] }] }],
};

describe("CutStudio programmable production runtime", () => {
  it("validates bounded, parameterized motion compositions", () => {
    expect(cutCompositionManifestSchema.parse(manifest).layers).toHaveLength(2);
    expect(() => cutCompositionManifestSchema.parse({ ...manifest, layers: [{ ...sourceLayer, durationInFrames: 121 }] })).toThrow(/inside the composition/i);
    expect(() => cutCompositionManifestSchema.parse({ ...manifest, layers: [{ ...sourceLayer, effects: [{ id: "mask", kind: "mask", enabled: true, parameters: {} }] }] })).toThrow(/private image asset/i);
  });

  it("evaluates deterministic keyframes and enabled effects at an exact frame", () => {
    const [frame] = evaluateCompositionFrame(manifest, 30);
    expect(frame).toMatchObject({ id: "source", localFrame: 30, sourceFrame: 30, x: .5, opacity: 1 });
    expect(frame.effects.map((effect) => effect.kind)).toEqual(["glow"]);
  });

  it("evaluates entry and exit transitions in the same deterministic frame model", () => {
    const entering = evaluateCompositionFrame(manifest, 10).find((layer) => layer.id === "title")!;
    const settled = evaluateCompositionFrame(manifest, 30).find((layer) => layer.id === "title")!;
    expect(entering).toMatchObject({ opacity: 1, scale: 1 });
    expect(entering.x).toBeGreaterThan(.1);
    expect(settled.x).toBeCloseTo(.1);
    const fading = evaluateCompositionFrame({ ...manifest, layers: [{ ...sourceLayer, exit: { kind: "fade" as const, durationInFrames: 10, easing: "linear" as const } }] }, 119)[0];
    expect(fading.opacity).toBeCloseTo(.1);
  });

  it("evaluates 3D transforms, animated filters, and geometric reveals without hiding them behind placeholders", () => {
    const visualManifest = {
      ...manifest,
      layers: [{
        ...sourceLayer,
        rotationX: 12,
        rotationY: -18,
        perspective: 900,
        enter: { kind: "iris" as const, durationInFrames: 20, easing: "linear" as const },
        animations: [
          { property: "blur" as const, keyframes: [{ frame: 0, value: 8 }, { frame: 20, value: 0 }] },
          { property: "brightness" as const, keyframes: [{ frame: 0, value: .5 }, { frame: 20, value: 1 }] },
          { property: "saturation" as const, keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 1 }] },
        ],
      }],
    };
    const [state] = evaluateCompositionFrame(visualManifest, 10);
    expect(state).toMatchObject({ rotationX: 12, rotationY: -18, perspective: 900, blur: 4, brightness: .75, saturation: .5, reveal: { kind: "iris", progress: .5 } });
    expect(state.opacity).toBe(1);
  });

  it("models flip transitions as deterministic 3D rotation", () => {
    const [state] = evaluateCompositionFrame({ ...manifest, layers: [{ ...sourceLayer, enter: { kind: "flip" as const, durationInFrames: 20, easing: "linear" as const, direction: "left" as const } }] }, 10);
    expect(state.rotationY).toBeCloseTo(-45);
    expect(state.scale).toBe(1);
  });

  it("requires and compiles one private custom reveal mask with sampled opacity", () => {
    const maskAssetId = "00000000-0000-4000-8000-000000000009";
    const maskedLayer = { id: "masked", kind: "shape" as const, name: "Masked", from: 0, durationInFrames: 60, x: .2, y: .2, width: .4, height: .4, style: { fill: "#ffffff" }, enter: { kind: "custom_mask" as const, durationInFrames: 20, easing: "linear" as const, maskAssetId } };
    expect(() => cutCompositionManifestSchema.parse({ ...manifest, layers: [sourceLayer, { ...maskedLayer, enter: { ...maskedLayer.enter, maskAssetId: undefined } }] })).toThrow(/private image asset/i);
    const edl = compileCompositionToEdl({ ...manifest, layers: [sourceLayer, maskedLayer] }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics?.[0]).toMatchObject({ revealKind: "custom_mask", revealMaskAssetId: maskAssetId, revealProgress: 0 });
    expect(edl.graphics?.[0].motionKeyframes).toEqual(expect.arrayContaining([expect.objectContaining({ at: 13 / 30, revealKind: "custom_mask", revealMaskAssetId: maskAssetId, revealProgress: .65, opacity: .65 })]));
  });

  it("compiles media motion and graphics into the editable EDL without flattening the source", () => {
    const edl = compileCompositionToEdl(manifest, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.clips[0]).toMatchObject({ id: "source", assetId: sourceAssetId, track: "v1", start: 0, end: 4 });
    expect(edl.clips[0].motionKeyframes).toMatchObject([{ at: 0, x: 0 }, { at: 2, x: 1 }]);
    expect(edl.graphics).toMatchObject([{ id: "title", text: "Ship the story", timelineStart: 1 / 3, duration: 2, rotation: -8 }]);
    expect(edl.graphics?.[0].motionKeyframes?.[0]).toMatchObject({ at: 0, opacity: 1 });
    expect(edl.graphics?.[0].motionKeyframes?.[0].x).toBeCloseTo(.34);
    expect(edl.graphics?.[0].motionKeyframes?.at(-1)).toMatchObject({ at: 2 - (1 / 30), opacity: 1 });
    expect(edl.graphics?.[0].motionKeyframes?.at(-1)?.x).toBeCloseTo(.1);
    expect(edl.graphics?.[0].motionKeyframes).toEqual(expect.arrayContaining([expect.objectContaining({ at: 1.5, scale: 1.4, rotation: -8 })]));
  });

  it("preserves independent named easing for every exported media property", () => {
    const easedManifest = {
      ...manifest,
      layers: [{
        ...sourceLayer,
        animations: [
          { property: "x" as const, keyframes: [{ frame: 0, value: 0 }, { frame: 60, value: .8, easing: "ease_in" as const }] },
          { property: "y" as const, keyframes: [{ frame: 0, value: 0 }, { frame: 60, value: .4, easing: "ease_out" as const }] },
          { property: "scale" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 60, value: 1.3, easing: "spring" as const }] },
          { property: "opacity" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 60, value: .3, easing: "step" as const }] },
          { property: "brightness" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 60, value: .7, easing: "ease_out" as const }] },
          { property: "saturation" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 60, value: .2, easing: "ease_in" as const }] },
        ],
      }],
    };
    const clip = compileCompositionToEdl(easedManifest, { version: 3, clips: [] }).clips[0];
    expect(clip.motionKeyframes?.at(-1)).toMatchObject({ at: 2, easing: "linear", xEasing: "ease_in", yEasing: "ease_out", scaleEasing: "spring", opacityEasing: "step", brightness: .7, saturation: .2, brightnessEasing: "ease_out", saturationEasing: "ease_in" });
  });

  it("renders typed data layers into the same final graphic contract as preview", () => {
    const dataManifest = {
      ...manifest,
      parameters: [{ key: "metric", label: "Metric", type: "text" as const, defaultValue: "42 qualified leads" }],
      layers: [sourceLayer, { id: "metric", kind: "data" as const, name: "Qualified leads", from: 0, durationInFrames: 60, text: "42 qualified leads", x: .1, y: .1, width: .3, height: .12, dataBindings: { text: "metric" }, style: {} }],
    };
    const resolved = resolveCompositionParameters(dataManifest, { metric: "63 qualified leads" });
    expect(resolved.layers[1]).toMatchObject({ kind: "data", text: "63 qualified leads" });
    const graphic = compileCompositionToEdl(resolved, { version: 3, clips: [] }).graphics![0]!;
    expect(graphic).toMatchObject({ kind: "title", text: "63 qualified leads", textColor: "#1d9bf0", backgroundColor: "#1d9bf0", backgroundOpacity: .15 });
    expect(() => cutCompositionManifestSchema.parse({ ...dataManifest, layers: [sourceLayer, { ...dataManifest.layers[1], text: undefined, dataBindings: {} }] })).toThrow(/Data layers require text/i);
  });

  it("expands same-format nested compositions with deterministic timing and private asset lineage", () => {
    const childId = "00000000-0000-4000-8000-000000000050";
    const rootId = "00000000-0000-4000-8000-000000000051";
    const child = {
      ...manifest,
      name: "Child motion",
      parameters: [{ key: "headline", label: "Headline", type: "text" as const, defaultValue: "Default child headline" }],
      layers: [{ ...sourceLayer, id: "child-source" }, { ...manifest.layers[1], id: "child-title", dataBindings: { text: "headline" } }],
    };
    const root = {
      ...manifest,
      name: "Master composition",
      durationInFrames: 130,
      layers: [{ id: "child", kind: "composition" as const, name: "Child motion", compositionId: childId, compositionParameters: { headline: "Resolved parent headline" }, from: 10, durationInFrames: 120 }],
    };
    const expanded = expandNestedCompositionManifest(root, { rootCompositionId: rootId, resolveComposition: (id) => id === childId ? child : undefined });
    expect(expanded.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "video", assetId: sourceAssetId, from: 10 }),
      expect.objectContaining({ kind: "text", text: "Resolved parent headline", from: 20 }),
    ]));
    expect(expanded.layers.every((layer) => layer.kind !== "composition")).toBe(true);
    const edl = compileCompositionToEdl(root, { version: 3, clips: [] }, { rootCompositionId: rootId, resolveComposition: (id) => id === childId ? child : undefined });
    expect(edl.clips[0]).toMatchObject({ assetId: sourceAssetId, timelineStart: 10 / 30 });
    expect(edl.graphics?.[0]).toMatchObject({ text: "Resolved parent headline", timelineStart: 20 / 30 });
  });

  it("expands an exact nested source-time trim without restarting child media or motion", () => {
    const childId = "00000000-0000-4000-8000-000000000054";
    const rootId = "00000000-0000-4000-8000-000000000055";
    const child = { ...manifest, name: "Trimmed child" };
    const root = {
      ...manifest,
      name: "Trimmed master",
      durationInFrames: 90,
      layers: [{ id: "child", kind: "composition" as const, name: "Trimmed child", compositionId: childId, from: 10, sourceStartFrame: 25, durationInFrames: 65 }],
    };
    const options = { rootCompositionId: rootId, resolveComposition: (id: string) => id === childId ? child : undefined };
    const expanded = expandNestedCompositionManifest(root, options);
    expect(expanded.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "video", from: 10, durationInFrames: 65, sourceStartFrame: 25 }),
      expect.objectContaining({ kind: "text", from: 10, durationInFrames: 45 }),
    ]));
    const title = evaluateCompositionFrame(expanded, 10).find((layer) => layer.kind === "text")!;
    expect(title.scale).toBeCloseTo(1 + (.4 * (15 / 45)));
    const edl = compileCompositionToEdl(root, { version: 3, clips: [] }, options);
    expect(edl.clips[0]).toMatchObject({ start: 25 / 30, end: 90 / 30, timelineStart: 10 / 30 });
    expect(edl.graphics?.[0]).toMatchObject({ timelineStart: 10 / 30, duration: 45 / 30 });
  });

  it("flattens static nested placement into child layout, opacity, gain, and authored curves", () => {
    const childId = "00000000-0000-4000-8000-000000000056";
    const rootId = "00000000-0000-4000-8000-000000000057";
    const child = {
      ...manifest,
      name: "Placed child",
      layers: [{
        ...sourceLayer,
        id: "placed-source",
        x: .1,
        y: .2,
        width: .4,
        height: .5,
        opacity: .8,
        volume: .5,
        effects: [],
        animations: [
          { property: "x" as const, keyframes: [{ frame: 0, value: .1 }, { frame: 60, value: .5 }] },
          { property: "y" as const, keyframes: [{ frame: 0, value: .2 }, { frame: 60, value: .6 }] },
          { property: "opacity" as const, keyframes: [{ frame: 0, value: .8 }, { frame: 60, value: .4 }] },
          { property: "volume" as const, keyframes: [{ frame: 0, value: .5 }, { frame: 60, value: 1 }] },
        ],
      }],
    };
    const root = {
      ...manifest,
      name: "Placed master",
      layers: [{
        id: "placed-child",
        kind: "composition" as const,
        name: "Placed child",
        compositionId: childId,
        from: 0,
        durationInFrames: 120,
        x: .2,
        y: .1,
        width: .5,
        height: .4,
        opacity: .7,
        volume: .4,
      }],
    };
    const options = { rootCompositionId: rootId, resolveComposition: (id: string) => id === childId ? child : undefined };
    const expanded = expandNestedCompositionManifest(root, options);
    const layer = expanded.layers[0]!;
    expect(layer).toMatchObject({ kind: "video", width: .2, height: .2, volume: .2 });
    expect(layer.x).toBeCloseTo(.25);
    expect(layer.y).toBeCloseTo(.18);
    expect(layer.opacity).toBeCloseTo(.56);
    const valuesFor = (property: "x" | "y" | "opacity" | "volume") => layer.animations.find((animation) => animation.property === property)!.keyframes.map((keyframe) => keyframe.value as number);
    expect(valuesFor("x")).toEqual([.25, .45]);
    expect(valuesFor("y")[0]).toBeCloseTo(.18);
    expect(valuesFor("y")[1]).toBeCloseTo(.34);
    expect(valuesFor("opacity")[0]).toBeCloseTo(.56);
    expect(valuesFor("opacity")[1]).toBeCloseTo(.28);
    expect(valuesFor("volume")).toEqual([.2, .4]);
    const frame = evaluateCompositionFrame(expanded, 60)[0]!;
    expect(frame.x).toBeCloseTo(.45);
    expect(frame.y).toBeCloseTo(.34);
    expect(frame.opacity).toBeCloseTo(.28);
    expect(frame.volume).toBeCloseTo(.4);
    const clip = compileCompositionToEdl(root, { version: 3, clips: [] }, options).clips[0]!;
    expect(clip.transform).toMatchObject({ width: .2, height: .2 });
    expect(clip.transform?.x).toBeCloseTo(.25);
    expect(clip.transform?.y).toBeCloseTo(.18);
    expect(clip.transform?.opacity).toBeCloseTo(.56);
    const finalMotion = clip.motionKeyframes?.find((point) => point.at === 2)!;
    expect(finalMotion.x).toBeCloseTo(.45);
    expect(finalMotion.y).toBeCloseTo(.34);
    expect(finalMotion.opacity).toBeCloseTo(.28);
  });

  it("flattens static uniform nested graphic rotation around the composition pivot", () => {
    const childId = "00000000-0000-4000-8000-000000000058";
    const rootId = "00000000-0000-4000-8000-000000000059";
    const child = {
      ...manifest,
      name: "Rotated graphic child",
      layers: [{
        id: "rotated-shape",
        kind: "shape" as const,
        name: "Pivot proof",
        from: 0,
        durationInFrames: 120,
        x: .1,
        y: .2,
        width: .2,
        height: .1,
        anchorX: .5,
        anchorY: .5,
        rotation: 10,
        opacity: .8,
        volume: 1,
        style: { fill: "#ff0000" },
        dataBindings: {},
        effects: [],
        animations: [{ property: "rotation" as const, keyframes: [{ frame: 0, value: 10 }, { frame: 60, value: 20 }] }],
      }],
    };
    const root = {
      ...manifest,
      name: "Rotated graphic master",
      layers: [
        sourceLayer,
        {
          id: "rotated-child",
          kind: "composition" as const,
          name: "Rotated graphic child",
          compositionId: childId,
          from: 0,
          durationInFrames: 120,
          x: .2,
          y: .2,
          width: .5,
          height: .5,
          anchorX: .5,
          anchorY: .5,
          rotation: 90,
          opacity: .5,
          volume: 1,
        },
      ],
    };
    const options = { rootCompositionId: rootId, resolveComposition: (id: string) => id === childId ? child : undefined };
    const expanded = expandNestedCompositionManifest(root, options);
    const layer = expanded.layers.find((candidate) => candidate.kind === "shape")!;
    // The child pivot maps from (.30, .325) around the group pivot (.45, .45)
    // to (.575, .30); its top-left is then reconstructed from its own anchor.
    expect(layer.x).toBeCloseTo(.525);
    expect(layer.y).toBeCloseTo(.275);
    expect(layer.width).toBeCloseTo(.1);
    expect(layer.height).toBeCloseTo(.05);
    expect(layer.rotation).toBeCloseTo(100);
    expect(layer.opacity).toBeCloseTo(.4);
    expect(layer.animations.find((animation) => animation.property === "rotation")?.keyframes.map((keyframe) => keyframe.value)).toEqual([100, 110]);
    const finalGraphic = compileCompositionToEdl(root, { version: 3, clips: [] }, options).graphics!.find((graphic) => graphic.kind === "shape")!;
    expect(finalGraphic).toMatchObject({ width: .1, height: .05, rotation: 100, backgroundOpacity: .4 });
    expect(finalGraphic.x).toBeCloseTo(.525);
    expect(finalGraphic.y).toBeCloseTo(.275);
    expect(finalGraphic.motionKeyframes?.find((keyframe) => keyframe.at === 2)?.rotation).toBeCloseTo(110);
  });

  it("rejects unsafe nested composition resolution instead of silently approximating it", () => {
    const childId = "00000000-0000-4000-8000-000000000052";
    const rootId = "00000000-0000-4000-8000-000000000053";
    const root = { ...manifest, layers: [{ id: "child", kind: "composition" as const, name: "Child", compositionId: childId, from: 0, durationInFrames: 120 }] };
    expect(() => expandNestedCompositionManifest(root, { rootCompositionId: rootId })).toThrow(/resolution is unavailable/i);
    expect(() => expandNestedCompositionManifest(root, { rootCompositionId: rootId, resolveComposition: () => ({ ...manifest, fps: 24 }) })).toThrow(/same width, height, and frame rate/i);
    expect(() => expandNestedCompositionManifest({ ...root, layers: [{ ...root.layers[0], rotation: 10, width: .8 }] }, { rootCompositionId: rootId, resolveComposition: () => manifest })).toThrow(/uniform container scaling/i);
    const staticVideoChild = { ...manifest, layers: [{ ...sourceLayer, animations: [] }] };
    const rotatedVideo = expandNestedCompositionManifest({ ...root, layers: [{ ...root.layers[0], rotation: 10 }] }, { rootCompositionId: rootId, resolveComposition: () => staticVideoChild });
    expect(rotatedVideo.layers.find((layer) => layer.kind === "video")?.rotation).toBeCloseTo(10);
    const audioChild = { ...manifest, layers: [{ ...sourceLayer, kind: "audio" as const, rotation: 0, animations: [] }] };
    expect(() => expandNestedCompositionManifest({ ...root, layers: [{ ...root.layers[0], rotation: 10 }] }, { rootCompositionId: rootId, resolveComposition: () => audioChild })).toThrow(/visual child layers/i);
    const slideChild = { ...manifest, layers: [{ ...sourceLayer, enter: { kind: "slide" as const, durationInFrames: 10 } }] };
    expect(() => expandNestedCompositionManifest({ ...root, layers: [{ ...root.layers[0], width: .8 }] }, { rootCompositionId: rootId, resolveComposition: () => slideChild })).toThrow(/child slide transitions/i);
    expect(() => expandNestedCompositionManifest({ ...root, layers: [{ ...root.layers[0], sourceStartFrame: 110, durationInFrames: 20 }] }, { rootCompositionId: rootId, resolveComposition: () => manifest })).toThrow(/source trim must remain/i);
    expect(() => expandNestedCompositionManifest({ ...root, layers: [{ ...root.layers[0], sourceStartFrame: 15, durationInFrames: 80 }] }, { rootCompositionId: rootId, resolveComposition: () => manifest })).toThrow(/start inside a child transition/i);
    const cyclic = { ...manifest, layers: [{ ...root.layers[0], compositionId: rootId }] };
    expect(() => expandNestedCompositionManifest(cyclic, { rootCompositionId: rootId, resolveComposition: (id) => id === rootId ? cyclic : undefined })).toThrow(/cannot contain a cycle/i);
  });

  it("compiles validated private animation layers for isolated final rendering", () => {
    const lottie = { id: "animated-mark", kind: "lottie" as const, name: "Animated mark", assetId: "00000000-0000-4000-8000-000000000008", from: 0, durationInFrames: 60 };
    const rive = { id: "interactive-mark", kind: "rive" as const, name: "Interactive mark", assetId: "00000000-0000-4000-8000-000000000009", from: 60, durationInFrames: 60 };
    const edl = compileCompositionToEdl({ ...manifest, layers: [sourceLayer, lottie, rive] }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "animated-mark", kind: "lottie", assetId: lottie.assetId, duration: 2 }),
      expect.objectContaining({ id: "interactive-mark", kind: "rive", assetId: rive.assetId, timelineStart: 2, duration: 2 }),
    ]));
    expect(() => cutCompositionManifestSchema.parse({ ...manifest, layers: [sourceLayer, { ...rive, assetId: undefined }] })).toThrow(/rive layers require an asset/i);
  });

  it("requires a declared private font family and compiles its asset into the final graphic", () => {
    const fontAssetId = "00000000-0000-4000-8000-000000000007";
    const family = "CreativesOS_00000000000040008000000000000007";
    const styled = { ...manifest, fonts: [{ family, assetId: fontAssetId, weight: 400 as const, style: "normal" as const }], layers: [sourceLayer, { ...manifest.layers[1], style: { ...manifest.layers[1].style, fontFamily: family } }] };
    const edl = compileCompositionToEdl(styled, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics?.[0]).toMatchObject({ fontAssetId, fontFamily: family, fontReferenceWidth: 1920 });
    expect(() => cutCompositionManifestSchema.parse({ ...styled, fonts: [] })).toThrow(/font family must exist/i);
  });

  it("assigns stable primary and overlay tracks when media layers start together", () => {
    const overlayAssetId = "00000000-0000-4000-8000-000000000002";
    const edl = compileCompositionToEdl({
      ...manifest,
      layers: [
        sourceLayer,
        { ...sourceLayer, id: "broll", name: "B-roll", assetId: overlayAssetId },
        manifest.layers[1],
      ],
    }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.clips).toMatchObject([
      { id: "source", assetId: sourceAssetId, track: "v1" },
      { id: "broll", assetId: overlayAssetId, track: "v2" },
    ]);
  });

  it("compiles a bounded composition shape into the final-render graphic graph", () => {
    const edl = compileCompositionToEdl({
      ...manifest,
      layers: [sourceLayer, {
        id: "accent",
        kind: "shape" as const,
        name: "Accent",
        from: 15,
        durationInFrames: 45,
        x: .6,
        y: .5,
        width: .3,
        height: .2,
        opacity: .75,
        rotation: 12,
        rotationX: 10,
        rotationY: 18,
        perspective: 800,
        enter: { kind: "iris" as const, durationInFrames: 20, easing: "linear" as const, direction: "in" as const },
        effects: [{ id: "glow", kind: "glow" as const, enabled: true, parameters: { radius: 12, color: "#1d9bf0" } }, { id: "grain", kind: "grain" as const, enabled: true, parameters: { amount: .3 } }],
        style: { fill: "#1d9bf0", borderRadius: 18 },
        animations: [{ property: "x" as const, keyframes: [{ frame: 0, value: .6 }, { frame: 30, value: .25 }] }, { property: "scale" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 30, value: 1.4 }] }, { property: "blur" as const, keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 3 }] }, { property: "brightness" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 30, value: .9 }] }, { property: "saturation" as const, keyframes: [{ frame: 0, value: 1 }, { frame: 30, value: .7 }] }],
      }],
    }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics).toMatchObject([{
      id: "accent",
      kind: "shape",
      text: "",
      timelineStart: .5,
      duration: 1.5,
      x: .6,
      y: .5,
      width: .3,
      height: .2,
      backgroundColor: "#1d9bf0",
      backgroundOpacity: .75,
      borderRadius: 18,
      rotation: 12,
      rotationX: 10,
      rotationY: 18,
      perspective: 800,
      effects: [{ kind: "glow", parameters: { radius: 12, color: "#1d9bf0" } }, { kind: "grain", parameters: { amount: .3 } }],
      motionKeyframes: expect.arrayContaining([expect.objectContaining({ at: 1, x: .25, scale: 1.4, rotation: 12, blur: 3, brightness: .9, saturation: .7 })]),
    }]);
    expect(edl.graphics?.[0].motionKeyframes).toEqual(expect.arrayContaining([expect.objectContaining({ at: 10 / 30, rotationX: 10, rotationY: 18, perspective: 800, revealKind: "iris", revealProgress: .5 })]));
  });

  it("compiles an allowlisted vector path and rejects active or unbounded source", () => {
    const vectorManifest = {
      ...manifest,
      layers: [sourceLayer, {
        id: "rule",
        kind: "path" as const,
        name: "Rule",
        from: 0,
        durationInFrames: 60,
        text: "M 0 50 L 100 50",
        x: .5,
        y: .5,
        width: .35,
        height: .35,
        opacity: .9,
        style: { stroke: "#ffffff", strokeWidth: 4 },
      }],
    };
    const edl = compileCompositionToEdl(vectorManifest, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics).toMatchObject([{ id: "rule", kind: "path", text: "M 0 50 L 100 50", textColor: "#ffffff", fillColor: null, strokeWidth: 4, backgroundOpacity: .9 }]);
    expect(() => compileCompositionToEdl({ ...vectorManifest, layers: [sourceLayer, { ...vectorManifest.layers[1], text: "<script>alert(1)</script>" }] }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4 }] })).toThrow(/path commands and numbers/i);
  });

  it("canonicalizes inert SVG graphics for preview and final rendering while rejecting active content", () => {
    const svg = `<svg viewBox="0 0 100 100"><g transform="translate(5 5)" opacity="0.9"><rect x="0" y="0" width="90" height="90" rx="12" fill="#00ff00"/><path d="M 15 50 L 45 75 L 78 18" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/></g></svg>`;
    const canonical = sanitizeCutStudioSvg(svg);
    expect(canonical).toContain('<svg viewBox="0 0 100 100">');
    expect(canonical).toContain('<g transform="translate(5 5)" opacity="0.9">');
    const edl = compileCompositionToEdl({
      ...manifest,
      layers: [sourceLayer, { id: "vector_logo", kind: "svg" as const, name: "Vector logo", from: 0, durationInFrames: 60, text: svg, x: .05, y: .05, width: .35, height: .35 }],
    }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics).toMatchObject([{ id: "vector_logo", kind: "svg", text: canonical, x: .05, y: .05, width: .35, height: .35 }]);
    for (const active of [
      `<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
      `<svg viewBox="0 0 10 10"><image href="https://example.com/x.png"/></svg>`,
      `<svg viewBox="0 0 10 10"><rect width="10" height="10" onclick="alert(1)"/></svg>`,
      `<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="url(https://example.com/x)"/></svg>`,
      `<!DOCTYPE svg><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`,
    ]) expect(() => sanitizeCutStudioSvg(active)).toThrow(/not allowed|declarations|allowlisted/i);
  });

  it("compiles an owned image layer into the raster graphic graph", () => {
    const imageAssetId = "00000000-0000-4000-8000-000000000003";
    const edl = compileCompositionToEdl({
      ...manifest,
      layers: [sourceLayer, { id: "product_still", kind: "image" as const, name: "Product still", from: 0, durationInFrames: 60, assetId: imageAssetId, x: .7, y: .05, width: .2, height: .2 }],
    }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics).toMatchObject([{ id: "product_still", kind: "image", assetId: imageAssetId, timelineStart: 0, duration: 2, x: .7, y: .05, width: .2, height: .2 }]);
    expect(() => compileCompositionToEdl({ ...manifest, layers: [sourceLayer, { id: "missing", kind: "image", name: "Missing", from: 0, durationInFrames: 30 }] }, { version: 3, clips: [{ start: 0, end: 4 }] })).toThrow(/require an asset/i);
  });

  it("compiles bounded editable 3D primitives into browser and final-render geometry", () => {
    const descriptor = parseCutThreePrimitiveStyle({ primitive: "pyramid", color: "#ffff00", secondaryColor: "#aa8800", edgeColor: "#ffffff", wireframe: false, depth: 1.5 });
    expect(renderCutThreePrimitiveSvg(descriptor)).toContain('aria-label="pyramid primitive"');
    const edl = compileCompositionToEdl({
      ...manifest,
      layers: [sourceLayer, { id: "product_3d", kind: "three" as const, name: "Product primitive", from: 0, durationInFrames: 60, x: .72, y: .32, width: .18, height: .18, rotationX: 12, rotationY: 24, perspective: 800, style: descriptor }],
    }, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.graphics).toMatchObject([{ id: "product_3d", kind: "three", primitive: "pyramid", backgroundColor: "#ffff00", secondaryColor: "#aa8800", edgeColor: "#ffffff", wireframe: false, depth: 1.5, rotationX: 12, rotationY: 24, perspective: 800 }]);
    expect(() => cutCompositionManifestSchema.parse({ ...manifest, layers: [sourceLayer, { id: "bad_3d", kind: "three", name: "Bad", from: 0, durationInFrames: 30, style: { primitive: "torus" } }] })).toThrow(/invalid enum|invalid option/i);
  });

  it("resolves typed parameter bindings into reproducible composition variants", () => {
    const parameterized = {
      ...manifest,
      parameters: [
        { key: "headline", label: "Headline", type: "text" as const, defaultValue: "Default", required: true },
        { key: "accent", label: "Accent", type: "color" as const, defaultValue: "#1d9bf0" },
        { key: "titleX", label: "Title X", type: "number" as const, defaultValue: .1, minimum: 0, maximum: .8 },
      ],
      layers: [sourceLayer, { ...manifest.layers[1], dataBindings: { text: "headline", "style.backgroundColor": "accent", x: "titleX" } }],
    };
    const variant = resolveCompositionParameters(parameterized, { headline: "Launch everywhere", accent: "#ff5500", titleX: .25 });
    expect(variant.layers[1]).toMatchObject({ text: "Launch everywhere", x: .25, style: { backgroundColor: "#ff5500" } });
    expect(variant.parameters.map((parameter) => parameter.defaultValue)).toEqual(["Launch everywhere", "#ff5500", .25]);
    expect(() => resolveCompositionParameters(parameterized, { titleX: 2 })).toThrow(/maximum/i);
    expect(() => resolveCompositionParameters(parameterized, { unknown: true })).toThrow(/unknown composition parameter/i);
  });

  it("requires isolated code capsules to pin source, lockfile, limits, and denied networking", () => {
    const capsule = cutCodeCapsuleSchema.parse({ version: 1, entrypoint: "src/index.tsx", sourceAssetId, lockfileAssetId: "00000000-0000-4000-8000-000000000002", runtime: "isolated_node", networkPolicy: "deny" });
    expect(capsule).toMatchObject({ networkPolicy: "deny", maximumCpuMs: 10_000, maximumMemoryMb: 512 });
    expect(() => cutCodeCapsuleSchema.parse({ ...capsule, networkPolicy: "allow" })).toThrow();
    expect(cutCodeCapsuleSchema.parse({ ...capsule, maximumMemoryMb: 2_048 }).maximumMemoryMb).toBe(2_048);
    expect(() => cutCodeCapsuleSchema.parse({ ...capsule, maximumMemoryMb: 2_049 })).toThrow();
  });

  it("rejects cyclic workflow self-references and models portable multi-stage pipelines", () => {
    const valid = cutGenerativeWorkflowSchema.parse({ version: 1, name: "Campaign", nodes: [{ id: "image", operation: "text_to_image" }, { id: "video", operation: "image_to_video", inputs: [{ slot: "start_frame", sourceNodeId: "image", sourceOutput: "image" }] }], outputs: [{ nodeId: "video", output: "video", label: "Hero" }] });
    expect(valid.nodes.map((node) => node.operation)).toEqual(["text_to_image", "image_to_video"]);
    expect(() => cutGenerativeWorkflowSchema.parse({ version: 1, name: "Bad", nodes: [{ id: "loop", operation: "image_to_video", inputs: [{ slot: "start_frame", sourceNodeId: "loop" }] }], outputs: [{ nodeId: "loop", output: "video", label: "Bad" }] })).toThrow(/another known node/i);
    expect(() => cutGenerativeWorkflowSchema.parse({ version: 1, name: "Cycle", nodes: [{ id: "a", operation: "image_to_video", inputs: [{ slot: "start_frame", sourceNodeId: "b" }] }, { id: "b", operation: "video_to_video", inputs: [{ slot: "source_video", sourceNodeId: "a" }] }], outputs: [{ nodeId: "b", output: "video", label: "Bad" }] })).toThrow(/acyclic/i);
  });

  it("keeps camera craft, rights, disclosure, and likeness consent in each shot", () => {
    const shot = cutShotSpecSchema.parse({ version: 1, name: "Hero", prompt: "Slow push toward the subject", durationSeconds: 5, aspect: "2.39:1", resolution: "2160p", fps: 24, model: "auto", camera: { cameraBody: "virtual cinema camera", lens: "anamorphic", focalLengthMm: 50, aperture: 2, shutterAngle: 180, iso: 800, filmStock: "digital neutral", movements: [{ kind: "dolly", direction: "in", intensity: .4, start: 0, end: 1 }] }, safety: { rightsConfirmed: true, likenessConsentConfirmed: true, syntheticMediaDisclosure: true } });
    expect(shot.camera).toMatchObject({ lens: "anamorphic", focalLengthMm: 50, movements: [{ kind: "dolly" }] });
    expect(shot.safety).toEqual({ rightsConfirmed: true, likenessConsentConfirmed: true, syntheticMediaDisclosure: true });
  });

  it("reports provider activation from explicit allowlisting and secret presence only", () => {
    const disabled = cutGenerationProviderRegistry({ OPENAI_API_KEY: "present" } as NodeJS.ProcessEnv);
    const enabled = cutGenerationProviderRegistry({ CUT_GENERATION_PROVIDERS: "openai,self_hosted", OPENAI_API_KEY: "present", CUT_GENERATION_BASE_URL: "https://models.example.test" } as NodeJS.ProcessEnv);
    expect(disabled.find((provider) => provider.id === "openai")?.configured).toBe(false);
    expect(enabled.find((provider) => provider.id === "openai")?.configured).toBe(true);
    expect(enabled.find((provider) => provider.id === "self_hosted")?.configured).toBe(true);
  });

  it("requires operation-specific media inputs before a generation job can exist", () => {
    const base = { provider: "self_hosted", model: "wan", prompt: "continue", variants: 1, idempotencyKey: "generation.input.1" };
    expect(() => cutGenerationRequestSchema.parse({ ...base, operation: "first_last_frame", inputs: [{ slot: "start_frame", assetIds: [sourceAssetId] }] })).toThrow(/end_frame/i);
    expect(cutGenerationRequestSchema.parse({ ...base, operation: "first_last_frame", inputs: [{ slot: "start_frame", assetIds: [sourceAssetId] }, { slot: "end_frame", assetIds: ["00000000-0000-4000-8000-000000000002"] }] }).operation).toBe("first_last_frame");
  });
});
