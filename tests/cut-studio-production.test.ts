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
  resolveCompositionParameters,
} from "../shared/cut-studio-production";

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
  layers: [sourceLayer, { id: "title", kind: "text" as const, name: "Title", from: 10, durationInFrames: 60, text: "Ship the story", x: .1, y: .7, style: { fontSize: 72, color: "#ffffff" }, enter: { kind: "slide" as const, durationInFrames: 12, easing: "spring" as const, direction: "right" as const } }],
};

describe("CutStudio programmable production runtime", () => {
  it("validates bounded, parameterized motion compositions", () => {
    expect(cutCompositionManifestSchema.parse(manifest).layers).toHaveLength(2);
    expect(() => cutCompositionManifestSchema.parse({ ...manifest, layers: [{ ...sourceLayer, durationInFrames: 121 }] })).toThrow(/inside the composition/i);
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

  it("compiles media motion and graphics into the editable EDL without flattening the source", () => {
    const edl = compileCompositionToEdl(manifest, { version: 3, clips: [{ id: "legacy", start: 0, end: 4, track: "v1", timelineStart: 0 }] });
    expect(edl.clips[0]).toMatchObject({ id: "source", assetId: sourceAssetId, track: "v1", start: 0, end: 4 });
    expect(edl.clips[0].motionKeyframes).toMatchObject([{ at: 0, x: 0 }, { at: 2, x: 1 }]);
    expect(edl.graphics).toMatchObject([{ id: "title", text: "Ship the story", timelineStart: 1 / 3, duration: 2 }]);
    expect(edl.graphics?.[0].motionKeyframes?.[0]).toMatchObject({ at: 0, opacity: 1 });
    expect(edl.graphics?.[0].motionKeyframes?.[0].x).toBeCloseTo(.34);
    expect(edl.graphics?.[0].motionKeyframes?.at(-1)).toMatchObject({ at: 2 - (1 / 30), opacity: 1 });
    expect(edl.graphics?.[0].motionKeyframes?.at(-1)?.x).toBeCloseTo(.1);
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
