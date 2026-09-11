import { z } from "zod";
import { cutCompositionEasingProgress, normalizeCutClips, type CutEdl, type CutMotionEasing } from "./cut-studio";
import { sanitizeCutStudioSvg } from "./cut-studio-svg";
import { parseCutThreePrimitiveStyle } from "./cut-studio-three";
import { resolveCutTextLayout, CUT_NATIVE_TEXT_MAX_CHARACTERS } from "./cut-text-layout";
import { cutLayerMaskAsset } from "./cut-mask";
import { cutImageFit } from "./cut-image-fit";
import { CUT_GRAPHIC_CURVE_PROPERTIES, cutGraphicCurvesSchema, type CutGraphicCurves } from "./cut-graphic-curves";
import { cutCodeInputContractSchema } from "./cut-code-render";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const jsonScalar = z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]);
const scalarRecord = z.record(z.string().max(80), jsonScalar).superRefine((value, context) => {
  if (Object.keys(value).length > 100) context.addIssue({ code: z.ZodIssueCode.custom, message: "At most 100 properties are allowed" });
});
const stringRecord = z.record(z.string().max(80), z.string().max(500)).superRefine((value, context) => {
  if (Object.keys(value).length > 100) context.addIssue({ code: z.ZodIssueCode.custom, message: "At most 100 properties are allowed" });
});

export const cutCompositionParameterSchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "boolean", "color", "select"]),
  defaultValue: jsonScalar,
  required: z.boolean().default(false),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
  options: z.array(z.string().max(120)).max(100).optional(),
}).superRefine((value, context) => {
  if (value.type === "select" && !value.options?.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Select parameters require options" });
  if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) context.addIssue({ code: z.ZodIssueCode.custom, path: ["minimum"], message: "Minimum cannot exceed maximum" });
});

export const cutCompositionKeyframeSchema = z.object({
  frame: z.number().int().min(0).max(2_592_000),
  value: z.union([z.number().finite(), color]),
  easing: z.enum(["linear", "ease_in", "ease_out", "ease_in_out", "spring", "step"]).default("linear"),
});

export const cutCompositionAnimationSchema = z.object({
  property: z.enum(["x", "y", "scale", "rotation", "rotationX", "rotationY", "perspective", "opacity", "volume", "blur", "brightness", "saturation"]),
  keyframes: z.array(cutCompositionKeyframeSchema).min(1).max(200),
}).superRefine((value, context) => {
  const frames = value.keyframes.map((item) => item.frame);
  if (new Set(frames).size !== frames.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["keyframes"], message: "Animation frames must be unique" });
});

export const cutMotionEffectSchema = z.object({
  id,
  kind: z.enum(["blur", "drop_shadow", "glow", "grain", "noise", "vignette", "color_matrix", "chroma_key", "mask", "displacement", "motion_blur", "light_leak"]),
  enabled: z.boolean().default(true),
  parameters: scalarRecord.default({}),
}).superRefine((value, context) => {
  if (value.kind !== "mask") return;
  const maskAssetId = value.parameters.maskAssetId;
  if (typeof maskAssetId !== "string" || !z.string().uuid().safeParse(maskAssetId).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["parameters", "maskAssetId"], message: "Mask effects require a private image asset" });
  }
});

export const cutLayerTransitionSchema = z.object({
  kind: z.enum(["none", "fade", "slide", "wipe", "zoom", "flip", "clock_wipe", "iris", "custom_mask"]),
  durationInFrames: z.number().int().min(0).max(3_600).default(0),
  easing: z.enum(["linear", "ease_in", "ease_out", "ease_in_out", "spring"]).default("ease_in_out"),
  direction: z.enum(["left", "right", "up", "down", "in", "out", "clockwise", "counterclockwise"]).optional(),
  maskAssetId: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (value.kind === "custom_mask" && !value.maskAssetId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["maskAssetId"], message: "Custom mask transitions require a private image asset" });
});

export const cutCompositionLayerSchema = z.object({
  id,
  kind: z.enum(["video", "audio", "image", "text", "shape", "svg", "path", "caption", "lottie", "rive", "three", "data", "composition"]),
  name: z.string().trim().min(1).max(120),
  from: z.number().int().min(0).max(2_592_000),
  durationInFrames: z.number().int().positive().max(2_592_000),
  assetId: z.string().uuid().optional(),
  // A composition is a project-scoped declarative manifest reference. It is
  // intentionally not an arbitrary URL or executable module.
  compositionId: z.string().uuid().optional(),
  compositionParameters: scalarRecord.optional(),
  sourceStartFrame: z.number().int().min(0).max(2_592_000).default(0),
  text: z.string().max(20_000).optional(),
  x: z.number().finite().min(-4).max(4).default(0),
  y: z.number().finite().min(-4).max(4).default(0),
  width: z.number().finite().positive().max(8).default(1),
  height: z.number().finite().positive().max(8).default(1),
  opacity: z.number().finite().min(0).max(1).default(1),
  rotation: z.number().finite().min(-3_600).max(3_600).default(0),
  volume: z.number().finite().min(0).max(2).default(1),
  anchorX: z.number().finite().min(-4).max(4).default(0.5),
  anchorY: z.number().finite().min(-4).max(4).default(0.5),
  rotationX: z.number().finite().min(-3_600).max(3_600).default(0),
  rotationY: z.number().finite().min(-3_600).max(3_600).default(0),
  perspective: z.number().finite().min(0).max(10_000).default(0),
  blendMode: z.enum(["normal", "multiply", "screen", "overlay", "darken", "lighten", "color_dodge", "color_burn", "difference", "exclusion"]).default("normal"),
  style: scalarRecord.default({}),
  dataBindings: z.record(z.string().max(80), z.string().max(500)).default({}),
  effects: z.array(cutMotionEffectSchema).max(50).default([]),
  enter: cutLayerTransitionSchema.optional(),
  exit: cutLayerTransitionSchema.optional(),
  animations: z.array(cutCompositionAnimationSchema).max(50).default([]),
}).superRefine((value, context) => {
  if (["video", "audio", "image", "lottie", "rive"].includes(value.kind) && !value.assetId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assetId"], message: `${value.kind} layers require an asset` });
  if (value.kind === "composition" && !value.compositionId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["compositionId"], message: "Composition layers require a project composition reference" });
  if (["text", "caption", "svg", "path"].includes(value.kind) && !value.text?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: `${value.kind} layers require source text or path data` });
  // Data layers are ordinary rendered text whose value can be supplied by a
  // typed composition parameter. Do not admit a browser-only placeholder: a
  // concrete fallback or a text binding is required for preview and export.
  if (value.kind === "data" && !value.text?.trim() && !value.dataBindings.text) context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Data layers require text or a typed text binding" });
  if (value.kind === "path" && value.text && (value.text.length > 4_000 || !/^[MmLlHhVvCcSsQqTtAaZz0-9+.,\s-]+$/.test(value.text))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Vector paths may contain only bounded SVG path commands and numbers" });
  if (value.kind === "svg" && value.text) {
    try { sanitizeCutStudioSvg(value.text); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: error instanceof Error ? error.message : "SVG source is invalid" });
    }
  }
  if (value.kind === "three") {
    try { parseCutThreePrimitiveStyle(value.style); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["style"], message: error instanceof Error ? error.message : "The 3D primitive descriptor is invalid" });
    }
  }
  if (Object.keys(value.dataBindings).length > 100) context.addIssue({ code: z.ZodIssueCode.custom, path: ["dataBindings"], message: "At most 100 data bindings are allowed" });
});

export const cutCompositionManifestSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(160),
  width: z.number().int().min(240).max(7_680),
  height: z.number().int().min(240).max(7_680),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
  durationInFrames: z.number().int().positive().max(2_592_000),
  background: color.default("#000000"),
  parameters: z.array(cutCompositionParameterSchema).max(100).default([]),
  layers: z.array(cutCompositionLayerSchema).max(500),
  fonts: z.array(z.object({ family: z.string().trim().min(1).max(160), assetId: z.string().uuid().optional(), weight: z.number().int().min(100).max(900).default(400), style: z.enum(["normal", "italic"]).default("normal") })).max(50).default([]),
  audioReactiveSignals: z.array(z.object({ id, assetId: z.string().uuid(), mode: z.enum(["amplitude", "frequency_band", "beats", "onsets"]), minimumHz: z.number().finite().min(0).max(48_000).optional(), maximumHz: z.number().finite().min(0).max(48_000).optional(), smoothing: z.number().finite().min(0).max(1).default(0.8) })).max(20).default([]),
  metadata: scalarRecord.default({}),
}).superRefine((value, context) => {
  const parameterKeys = value.parameters.map((item) => item.key);
  const layerIds = value.layers.map((item) => item.id);
  const fontFamilies = value.fonts.map((item) => item.family);
  if (new Set(parameterKeys).size !== parameterKeys.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["parameters"], message: "Parameter keys must be unique" });
  if (new Set(layerIds).size !== layerIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers"], message: "Layer identifiers must be unique" });
  if (new Set(fontFamilies).size !== fontFamilies.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["fonts"], message: "Font families must be unique" });
  value.layers.forEach((layer, index) => {
    if (["text", "caption"].includes(layer.kind) && (layer.text?.length ?? 0) > CUT_NATIVE_TEXT_MAX_CHARACTERS) context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", index, "text"], message: `Native text is limited to ${CUT_NATIVE_TEXT_MAX_CHARACTERS} characters` });
    if (layer.from + layer.durationInFrames > value.durationInFrames) context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", index], message: "Layer must remain inside the composition" });
    layer.animations.forEach((animation, animationIndex) => animation.keyframes.forEach((keyframe, keyframeIndex) => {
      if (keyframe.frame >= layer.durationInFrames) context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", index, "animations", animationIndex, "keyframes", keyframeIndex], message: "Keyframe must remain inside its layer" });
    }));
    if (typeof layer.style.fontFamily === "string" && !value.fonts.some((font) => font.family === layer.style.fontFamily)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", index, "style", "fontFamily"], message: "A selected font family must exist in the composition font library" });
    }
  });
});

export const cutCompositionVariantBatchSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/),
  variants: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    parameterValues: z.record(z.string().max(80), jsonScalar).superRefine((value, context) => {
      if (Object.keys(value).length > 100) context.addIssue({ code: z.ZodIssueCode.custom, message: "At most 100 parameter values are allowed" });
    }),
  })).min(1).max(20),
});

export const cutCodeCapsuleSchema = z.object({
  version: z.literal(1),
  entrypoint: z.string().regex(/^(?:src\/)?[A-Za-z0-9_./-]+\.(?:ts|tsx)$/).max(240),
  sourceAssetId: z.string().uuid(),
  lockfileAssetId: z.string().uuid(),
  runtime: z.literal("isolated_node"),
  networkPolicy: z.literal("deny"),
  inputContract: cutCodeInputContractSchema.nullable().default(null),
  maximumCpuMs: z.number().int().min(100).max(120_000).default(10_000),
  // The paired local runtime is isolated at 128 MiB–2 GiB. Never persist a
  // capsule entitlement it cannot actually enforce at execution time.
  maximumMemoryMb: z.number().int().min(128).max(2_048).default(512),
  // The paired local runtime rejects outputs above its fixed artifact ceiling.
  maximumOutputBytes: z.number().int().min(1_024).max(67_108_864).default(67_108_864),
});

export const cutProductionBriefSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1).max(160),
  objective: z.string().trim().max(4_000).default(""),
  audience: z.string().trim().max(1_000).default(""),
  genre: z.enum(["general", "action", "epic", "drama", "comedy", "horror", "documentary", "commercial", "music", "social"]).default("general"),
  era: z.string().trim().max(80).default("contemporary"),
  tone: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  required: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  forbidden: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  referenceAssetIds: z.array(z.string().uuid()).max(50).default([]),
  defaultAspect: z.enum(["9:16", "1:1", "4:5", "16:9", "2.39:1"]).default("16:9"),
  defaultResolution: z.enum(["720p", "1080p", "2160p"]).default("1080p"),
  defaultFps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).default(24),
  pacing: z.enum(["single_shot", "calm", "dynamic", "chaotic", "custom"]).default("custom"),
});

export const cutProductionElementSpecSchema = z.object({
  kind: z.enum(["cast", "location", "prop", "wardrobe", "product", "style", "sound"]),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4_000).default(""),
  referenceAssetIds: z.array(z.string().uuid()).max(30).default([]),
  traits: stringRecord.default({}),
  continuityLock: z.boolean().default(true),
  consentConfirmed: z.boolean().default(false),
  syntheticIdentityDisclosure: z.enum(["not_applicable", "required", "confirmed"]).default("not_applicable"),
});

export const cutCameraRigSchema = z.object({
  cameraBody: z.string().trim().max(120).default("virtual cinema camera"),
  lens: z.string().trim().max(120).default("spherical prime"),
  focalLengthMm: z.number().finite().min(4).max(2_000).default(35),
  aperture: z.number().finite().min(0.7).max(64).default(2.8),
  shutterAngle: z.number().finite().min(1).max(360).default(180),
  iso: z.number().int().min(25).max(204_800).default(800),
  filmStock: z.string().trim().max(120).default("digital neutral"),
  movements: z.array(z.object({
    kind: z.enum(["static", "pan", "tilt", "dolly", "truck", "pedestal", "orbit", "crane", "zoom", "handheld", "steadicam", "drone", "rack_focus"]),
    direction: z.enum(["left", "right", "up", "down", "in", "out", "clockwise", "counterclockwise", "auto"]).default("auto"),
    intensity: z.number().finite().min(0).max(1).default(0.5),
    start: z.number().finite().min(0).max(1).default(0),
    end: z.number().finite().min(0).max(1).default(1),
  })).max(3).default([]),
});

export const cutShotSpecSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(10_000),
  negativePrompt: z.string().trim().max(4_000).default(""),
  durationSeconds: z.number().finite().min(0.5).max(60),
  aspect: z.enum(["9:16", "1:1", "4:5", "16:9", "2.39:1"]),
  resolution: z.enum(["720p", "1080p", "2160p"]),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
  operation: z.enum(["text_to_video", "image_to_video", "first_last_frame", "video_to_video", "extend_video", "motion_transfer", "lip_sync", "talking_avatar", "inpaint_video", "relight_video", "upscale_video"]).default("text_to_video"),
  model: z.string().regex(/^[a-z0-9][a-z0-9._/-]{0,119}$/),
  seed: z.number().int().min(0).max(2_147_483_647).nullable().default(null),
  elementIds: z.array(z.string().uuid()).max(50).default([]),
  firstFrameAssetId: z.string().uuid().nullable().default(null),
  lastFrameAssetId: z.string().uuid().nullable().default(null),
  visualReferenceAssetIds: z.array(z.string().uuid()).max(20).default([]),
  motionReferenceAssetId: z.string().uuid().nullable().default(null),
  audioReferenceAssetId: z.string().uuid().nullable().default(null),
  camera: cutCameraRigSchema,
  lighting: z.string().trim().max(1_000).default(""),
  emotion: z.string().trim().max(240).default(""),
  colorGrade: z.object({
    preset: z.string().trim().max(120).default("neutral"),
    temperature: z.number().finite().min(-1).max(1).default(0),
    contrast: z.number().finite().min(0).max(2).default(1),
    saturation: z.number().finite().min(0).max(3).default(1),
  }).default({ preset: "neutral", temperature: 0, contrast: 1, saturation: 1 }),
  audioMode: z.enum(["silent", "native", "voice", "music", "effects", "mixed"]).default("native"),
  safety: z.object({
    rightsConfirmed: z.boolean().default(false),
    likenessConsentConfirmed: z.boolean().default(false),
    syntheticMediaDisclosure: z.boolean().default(false),
  }).default({ rightsConfirmed: false, likenessConsentConfirmed: false, syntheticMediaDisclosure: false }),
});

export const cutGenerativeOperationSchema = z.enum([
  "text_to_image", "image_to_image", "inpaint_image", "outpaint_image", "remove_background", "relight_image", "upscale_image", "product_placement",
  "text_to_video", "image_to_video", "first_last_frame", "video_to_video", "extend_video", "motion_transfer", "lip_sync", "talking_avatar", "inpaint_video", "relight_video", "upscale_video",
  "text_to_speech", "voice_clone", "music_generation", "sound_effect_generation", "audio_cleanup", "audio_separation",
]);

export const cutGenerationInputSchema = z.object({
  slot: z.enum(["start_frame", "end_frame", "reference_image", "reference_video", "motion_video", "source_video", "source_audio", "mask", "character", "product", "style"]),
  assetIds: z.array(z.string().uuid()).min(1).max(14),
  required: z.boolean().default(true),
});

export const cutModelCapabilitySchema = z.object({
  provider: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  model: z.string().regex(/^[a-z0-9][a-z0-9._/:-]{0,159}$/),
  label: z.string().trim().min(1).max(160),
  operations: z.array(cutGenerativeOperationSchema).min(1).max(50),
  inputs: z.array(z.object({ slot: cutGenerationInputSchema.shape.slot, minimum: z.number().int().min(0).max(14).default(0), maximum: z.number().int().min(1).max(14).default(1) })).max(20).default([]),
  aspects: z.array(z.enum(["9:16", "1:1", "4:5", "16:9", "2.39:1"])).min(1),
  maximumDurationSeconds: z.number().finite().positive().max(600).nullable().default(null),
  resolutions: z.array(z.enum(["720p", "1080p", "2160p"])).min(1),
  nativeAudio: z.boolean().default(false),
  deterministicSeed: z.boolean().default(false),
  local: z.boolean().default(false),
  configured: z.boolean().default(false),
  parameters: z.array(z.object({ key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), type: z.enum(["number", "integer", "boolean", "text", "select"]), required: z.boolean().default(false), minimum: z.number().finite().optional(), maximum: z.number().finite().optional(), options: z.array(z.string().max(120)).max(100).optional(), defaultValue: jsonScalar.optional() })).max(100).default([]),
});

export const cutGenerativeWorkflowSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).default(""),
  nodes: z.array(z.object({
    id,
    operation: cutGenerativeOperationSchema,
    provider: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).default("auto"),
    model: z.string().regex(/^[a-z0-9][a-z0-9._/:-]{0,159}$/).default("auto"),
    prompt: z.string().max(10_000).default(""),
    parameters: scalarRecord.default({}),
    inputs: z.array(z.object({ slot: cutGenerationInputSchema.shape.slot, sourceNodeId: id.optional(), sourceOutput: z.string().max(80).optional(), assetIds: z.array(z.string().uuid()).max(14).default([]) })).max(30).default([]),
    position: z.object({ x: z.number().finite().min(-100_000).max(100_000), y: z.number().finite().min(-100_000).max(100_000) }).default({ x: 0, y: 0 }),
  })).min(1).max(200),
  outputs: z.array(z.object({ nodeId: id, output: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(120) })).min(1).max(50),
}).superRefine((value, context) => {
  const nodeIds = value.nodes.map((node) => node.id);
  const known = new Set(nodeIds);
  if (known.size !== nodeIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: "Workflow node identifiers must be unique" });
  value.nodes.forEach((node, nodeIndex) => node.inputs.forEach((input, inputIndex) => {
    if (input.sourceNodeId && (!known.has(input.sourceNodeId) || input.sourceNodeId === node.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", nodeIndex, "inputs", inputIndex, "sourceNodeId"], message: "Workflow inputs must reference another known node" });
  }));
  const edges = new Map(value.nodes.map((node) => [node.id, node.inputs.flatMap((input) => input.sourceNodeId ? [input.sourceNodeId] : [])]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    if ((edges.get(nodeId) ?? []).some(visit)) return true;
    visiting.delete(nodeId); visited.add(nodeId); return false;
  };
  if (value.nodes.some((node) => visit(node.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: "Workflow dependencies must form an acyclic graph" });
  value.outputs.forEach((output, index) => {
    if (!known.has(output.nodeId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["outputs", index, "nodeId"], message: "Workflow outputs must reference a known node" });
  });
});

export const cutGenerationRequestSchema = z.object({
  operation: cutGenerativeOperationSchema,
  provider: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  model: z.string().regex(/^[a-z0-9][a-z0-9._/:-]{0,159}$/),
  prompt: z.string().trim().max(10_000).default(""),
  negativePrompt: z.string().trim().max(4_000).default(""),
  inputs: z.array(cutGenerationInputSchema).max(30).default([]),
  parameters: scalarRecord.default({}),
  variants: z.number().int().min(1).max(8).default(1),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/),
}).superRefine((value, context) => {
  const available = new Set(value.inputs.flatMap((input) => input.assetIds.length ? [input.slot] : []));
  const required: Partial<Record<z.infer<typeof cutGenerativeOperationSchema>, Array<z.infer<typeof cutGenerationInputSchema>["slot"] | Array<z.infer<typeof cutGenerationInputSchema>["slot"]>>>> = {
    image_to_image: [["reference_image", "start_frame"]],
    inpaint_image: [["reference_image", "start_frame"], "mask"],
    outpaint_image: [["reference_image", "start_frame"]],
    remove_background: [["reference_image", "start_frame"]],
    relight_image: [["reference_image", "start_frame"]],
    upscale_image: [["reference_image", "start_frame"]],
    product_placement: ["product", "reference_image"],
    image_to_video: [["start_frame", "reference_image"]],
    first_last_frame: ["start_frame", "end_frame"],
    video_to_video: ["source_video"],
    extend_video: ["source_video"],
    motion_transfer: ["source_video", "motion_video"],
    lip_sync: ["source_video", "source_audio"],
    talking_avatar: [["start_frame", "reference_image", "character"], "source_audio"],
    inpaint_video: ["source_video", "mask"],
    relight_video: ["source_video"],
    upscale_video: ["source_video"],
    voice_clone: ["source_audio"],
    audio_cleanup: ["source_audio"],
    audio_separation: ["source_audio"],
  };
  for (const requirement of required[value.operation] ?? []) {
    const alternatives = Array.isArray(requirement) ? requirement : [requirement];
    if (!alternatives.some((slot) => available.has(slot))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["inputs"], message: `${value.operation.replaceAll("_", " ")} requires ${alternatives.join(" or ")}` });
  }
});

export type CutCompositionManifest = z.infer<typeof cutCompositionManifestSchema>;

export type CutCompositionResolver = (compositionId: string) => unknown | undefined;

export type CutCompositionExpansionOptions = {
  resolveComposition?: CutCompositionResolver;
  rootCompositionId?: string;
  maxDepth?: number;
};

function nestedLayerId(path: string[], layerId: string) {
  // Keep generated ids inside the public schema's 80-character envelope while
  // retaining deterministic uniqueness across sibling composition paths.
  let hash = 2_166_136_261;
  for (const character of `${path.join("/")}::${layerId}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return `nested_${(hash >>> 0).toString(36)}_${layerId.slice(0, 48)}`;
}

function assertSupportedCompositionContainer(layer: CutCompositionManifest["layers"][number]) {
  // A nested composition is flattened into its native children, rather than
  // rendered into an intermediate bitmap. Static rectangular placement is
  // exact under that model: its layout, opacity and audio gain can be applied
  // to every child before either preview or EDL compilation. General group
  // transforms are not equivalent to applying the same property per child
  // (for example, a rotated non-square group introduces a matrix/skew), and
  // group effects/blending need an intermediate composite. Keep those cases
  // fail-closed instead of silently producing a different final render.
  const hasStaticUniform2dRotation = layer.rotation !== 0;
  if (layer.rotationX !== 0 || layer.rotationY !== 0 || layer.perspective !== 0 || layer.blendMode !== "normal" || layer.effects.length || layer.animations.length || layer.enter?.kind !== undefined || layer.exit?.kind !== undefined) {
    throw new Error("Nested composition containers support static placement, rectangular scaling, opacity, audio gain, and static uniform 2D graphic rotation only; 3D, effects, blend, animation, and transitions require composition-group rendering");
  }
  if (hasStaticUniform2dRotation && Math.abs(layer.width - layer.height) > 0.000001) {
    throw new Error("Nested composition rotation requires uniform container scaling until composition-group rendering is available");
  }
}

function mapNestedAnimationValues(
  animation: CutCompositionManifest["layers"][number]["animations"][number],
  transform: (value: number) => number,
) {
  return {
    ...animation,
    keyframes: animation.keyframes.map((keyframe) => {
      if (typeof keyframe.value !== "number") throw new Error("Nested composition layout requires numeric animation keyframes");
      return { ...keyframe, value: transform(keyframe.value) };
    }),
  };
}

/**
 * Flatten one static composition container into a child layer. The container
 * coordinates describe the child's complete canvas, so translating/scaling a
 * child is affine in the parent's rectangular layout. This transforms every
 * authored X/Y/opacity/volume curve too; otherwise a child would look correct
 * at its keyframes but drift in between during preview or final rendering.
 */
function applyNestedContainerLayout(child: CutCompositionManifest["layers"][number], container: CutCompositionManifest["layers"][number]) {
  const scaleX = container.width;
  const scaleY = container.height;
  const hasRectangularScale = scaleX !== 1 || scaleY !== 1;
  if (hasRectangularScale && [child.enter, child.exit].some((transition) => transition?.kind === "slide")) {
    // Slide distances are currently part of the transition descriptor rather
    // than scalar animation curves. Scaling a group would need a dedicated
    // group transition evaluator to preserve those distances exactly.
    throw new Error("Nested composition rectangular scaling cannot contain child slide transitions until composition-group rendering is available");
  }
  const animations = child.animations.map((animation) => {
    if (animation.property === "x") return mapNestedAnimationValues(animation, (value) => container.x + value * scaleX);
    if (animation.property === "y") return mapNestedAnimationValues(animation, (value) => container.y + value * scaleY);
    if (animation.property === "opacity") return mapNestedAnimationValues(animation, (value) => value * container.opacity);
    if (animation.property === "volume") return mapNestedAnimationValues(animation, (value) => value * container.volume);
    return animation;
  });
  return cutCompositionLayerSchema.parse({
    ...child,
    x: container.x + child.x * scaleX,
    y: container.y + child.y * scaleY,
    width: child.width * scaleX,
    height: child.height * scaleY,
    opacity: child.opacity * container.opacity,
    volume: child.volume * container.volume,
    animations,
  });
}

/**
 * Flatten a static, uniformly scaled 2D graphic group without losing its
 * pivot. Parent rotation cannot be copied to every child position: a child
 * needs to be moved by the rotated location of *its own transform origin*,
 * then receive the parent angle in its local rotation. This is the exact
 * similarity transform for a static graphic subtree, but intentionally does
 * not pretend to cover media, blended/effected groups, 3D, transitions, or
 * independent X/Y motion curves. Those require a real intermediate group
 * surface in both the browser and native renderer.
 */
function applyStaticUniformNestedGraphicRotation(child: CutCompositionManifest["layers"][number], container: CutCompositionManifest["layers"][number]) {
  if (child.kind === "audio") throw new Error("Nested composition rotation currently supports visual child layers only; rotated audio groups require composition-group rendering");
  if (child.blendMode !== "normal" || child.rotationX !== 0 || child.rotationY !== 0 || child.perspective !== 0 || [child.enter, child.exit].some((transition) => transition?.kind === "flip" || transition?.kind === "slide")) {
    throw new Error("Nested composition rotation cannot contain blended, 3D, flip, or slide child graphics until composition-group rendering is available");
  }
  if (child.animations.some((animation) => ["x", "y", "rotationX", "rotationY", "perspective"].includes(animation.property))) {
    throw new Error("Nested composition rotation cannot contain child position or 3D animation until composition-group rendering is available");
  }
  const scale = container.width;
  const angle = container.rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const groupPivotX = container.x + container.anchorX * scale;
  const groupPivotY = container.y + container.anchorY * scale;
  const childPivotX = container.x + (child.x + child.anchorX * child.width) * scale;
  const childPivotY = container.y + (child.y + child.anchorY * child.height) * scale;
  const deltaX = childPivotX - groupPivotX;
  const deltaY = childPivotY - groupPivotY;
  const transformedPivotX = groupPivotX + deltaX * cosine - deltaY * sine;
  const transformedPivotY = groupPivotY + deltaX * sine + deltaY * cosine;
  const width = child.width * scale;
  const height = child.height * scale;
  const animations = child.animations.map((animation) => animation.property === "rotation"
    ? mapNestedAnimationValues(animation, (value) => value + container.rotation)
    : animation.property === "opacity"
      ? mapNestedAnimationValues(animation, (value) => value * container.opacity)
      : animation.property === "volume"
        ? mapNestedAnimationValues(animation, (value) => value * container.volume)
        : animation,
  );
  return cutCompositionLayerSchema.parse({
    ...child,
    x: transformedPivotX - child.anchorX * width,
    y: transformedPivotY - child.anchorY * height,
    width,
    height,
    rotation: child.rotation + container.rotation,
    opacity: child.opacity * container.opacity,
    volume: child.volume * container.volume,
    animations,
  });
}

function numericAnimationFallback(layer: CutCompositionManifest["layers"][number], property: CutCompositionManifest["layers"][number]["animations"][number]["property"]) {
  if (property === "x") return layer.x;
  if (property === "y") return layer.y;
  if (property === "opacity") return layer.opacity;
  if (property === "rotation") return layer.rotation;
  if (property === "rotationX") return layer.rotationX;
  if (property === "rotationY") return layer.rotationY;
  if (property === "perspective") return layer.perspective;
  if (property === "volume") return layer.volume;
  if (property === "brightness" || property === "saturation") return 1;
  return property === "scale" ? 1 : 0;
}

/**
 * Make a source-time slice of a child layer behave as though it began at frame
 * zero. A composition container is not rendered as an intermediate bitmap:
 * the child remains native media/graphics, so source offsets, animation
 * sampling and private asset lineage all survive expansion.
 *
 * Transitions are only retained where their original temporal domain is fully
 * visible. Reconstructing a partially-cut reveal as a fresh fade/wipe would be
 * a visual approximation, so the caller rejects that case explicitly.
 */
function rebaseNestedLayerTime(layer: CutCompositionManifest["layers"][number], sourceWindowStart: number, sourceWindowEnd: number, containerFrom: number): CutCompositionManifest["layers"][number] | null {
  const visibleStart = Math.max(layer.from, sourceWindowStart);
  const visibleEnd = Math.min(layer.from + layer.durationInFrames, sourceWindowEnd);
  if (visibleEnd <= visibleStart) return null;
  const trimStart = visibleStart - layer.from;
  const durationInFrames = visibleEnd - visibleStart;
  const trimEnd = layer.durationInFrames - (trimStart + durationInFrames);
  if (layer.enter && layer.enter.kind !== "none" && trimStart > 0) {
    if (trimStart < layer.enter.durationInFrames) throw new Error("Nested composition trims cannot start inside a child transition");
  }
  if (layer.exit && layer.exit.kind !== "none" && trimEnd > 0) {
    if (trimEnd < layer.exit.durationInFrames) throw new Error("Nested composition trims cannot end inside a child transition");
  }
  const animations = layer.animations.map((animation) => {
    if (!animation.keyframes.every((keyframe) => typeof keyframe.value === "number")) {
      throw new Error("Nested composition trims require numeric animation keyframes");
    }
    const initial = valueAtFrame(layer, animation.property, trimStart, numericAnimationFallback(layer, animation.property));
    const keyframes = [
      { frame: 0, value: initial, easing: "linear" as const },
      ...animation.keyframes
        .filter((keyframe) => keyframe.frame > trimStart && keyframe.frame < trimStart + durationInFrames)
        .map((keyframe) => ({ ...keyframe, frame: keyframe.frame - trimStart })),
    ];
    return { ...animation, keyframes };
  });
  const { enter, exit, ...baseLayer } = layer;
  return cutCompositionLayerSchema.parse({
    ...baseLayer,
    from: containerFrom + (visibleStart - sourceWindowStart),
    durationInFrames,
    sourceStartFrame: layer.sourceStartFrame + trimStart,
    ...(trimStart === 0 && enter ? { enter } : {}),
    ...(trimEnd === 0 && exit ? { exit } : {}),
    animations,
  });
}

/**
 * Resolve a bounded tree of saved declarative compositions into one manifest
 * before browser preview or final EDL compilation. The contract deliberately
 * rejects different canvas formats and non-neutral parent transforms: silently
 * approximating either would make preview and export disagree. Child
 * compositions may be placed as an exact source-time trim when that trim does
 * not split an authored child transition.
 */
export function expandNestedCompositionManifest(manifestInput: unknown, options: CutCompositionExpansionOptions = {}): CutCompositionManifest {
  const root = cutCompositionManifestSchema.parse(manifestInput);
  // The common non-nested path remains a single schema validation. Besides
  // preserving render admission latency, this keeps the sampled-motion path
  // from repeatedly validating an already admitted manifest.
  if (!root.layers.some((layer) => layer.kind === "composition")) return root;
  const maxDepth = Math.max(1, Math.min(8, Math.floor(options.maxDepth ?? 4)));
  const usedLayerIds = new Set<string>();
  const fonts = new Map(root.fonts.map((font) => [font.family, font]));
  const signals = new Map(root.audioReactiveSignals.map((signal) => [signal.id, signal]));

  const expand = (manifest: CutCompositionManifest, path: string[], stack: string[], depth: number): CutCompositionManifest["layers"] => manifest.layers.flatMap((layer) => {
    if (layer.kind !== "composition") {
      const id = path.length ? nestedLayerId(path, layer.id) : layer.id;
      if (usedLayerIds.has(id)) throw new Error("Nested composition expansion created a duplicate layer id");
      usedLayerIds.add(id);
      return [{ ...layer, id }];
    }
    assertSupportedCompositionContainer(layer);
    if (depth >= maxDepth) throw new Error(`Nested compositions may be at most ${maxDepth} levels deep`);
    if (!options.resolveComposition) throw new Error("Nested composition resolution is unavailable");
    const referencedRaw = options.resolveComposition(layer.compositionId!);
    if (!referencedRaw) throw new Error("Nested composition is unavailable in this project");
    if (stack.includes(layer.compositionId!)) throw new Error("Nested compositions cannot contain a cycle");
    const referenced = resolveCompositionParameters(referencedRaw, layer.compositionParameters ?? {});
    if (referenced.width !== manifest.width || referenced.height !== manifest.height || referenced.fps !== manifest.fps) throw new Error("Nested compositions must use the same width, height, and frame rate as their parent");
    const sourceWindowEnd = layer.sourceStartFrame + layer.durationInFrames;
    if (sourceWindowEnd > referenced.durationInFrames) throw new Error("Nested composition source trim must remain inside the referenced composition");
    for (const font of referenced.fonts) {
      const existing = fonts.get(font.family);
      if (existing && JSON.stringify(existing) !== JSON.stringify(font)) throw new Error(`Nested composition font family conflict: ${font.family}`);
      fonts.set(font.family, font);
    }
    for (const signal of referenced.audioReactiveSignals) {
      const id = path.length ? nestedLayerId([...path, layer.id], signal.id) : signal.id;
      signals.set(id, { ...signal, id });
    }
    return expand(referenced, [...path, layer.id], [...stack, layer.compositionId!], depth + 1)
      .flatMap((child) => {
        const rebased = rebaseNestedLayerTime(child, layer.sourceStartFrame, sourceWindowEnd, layer.from);
        if (!rebased) return [];
        return [layer.rotation === 0 ? applyNestedContainerLayout(rebased, layer) : applyStaticUniformNestedGraphicRotation(rebased, layer)];
      });
  });

  const layers = expand(root, [], options.rootCompositionId ? [options.rootCompositionId] : [], 0);
  return cutCompositionManifestSchema.parse({ ...root, layers, fonts: Array.from(fonts.values()), audioReactiveSignals: Array.from(signals.values()) });
}
export type CutCompositionVariantBatch = z.infer<typeof cutCompositionVariantBatchSchema>;
export type CutCodeCapsule = z.infer<typeof cutCodeCapsuleSchema>;
export type CutProductionBrief = z.infer<typeof cutProductionBriefSchema>;
export type CutProductionElementSpec = z.infer<typeof cutProductionElementSpecSchema>;
export type CutShotSpec = z.infer<typeof cutShotSpecSchema>;
export type CutGenerationRequest = z.infer<typeof cutGenerationRequestSchema>;
export type CutModelCapability = z.infer<typeof cutModelCapabilitySchema>;
export type CutGenerativeWorkflow = z.infer<typeof cutGenerativeWorkflowSchema>;

const numericBindingTargets = new Set(["x", "y", "width", "height", "opacity", "rotation", "volume", "anchorX", "anchorY", "rotationX", "rotationY", "perspective"]);
const styleBindingTargets = new Set(["color", "backgroundColor", "backgroundOpacity", "fontSize", "fill", "stroke", "strokeWidth", "borderRadius"]);

export function resolveCompositionParameters(manifestInput: unknown, parameterValuesInput: unknown) {
  const manifest = cutCompositionManifestSchema.parse(manifestInput);
  const parameterValues = z.record(jsonScalar).parse(parameterValuesInput);
  const definitions = new Map(manifest.parameters.map((parameter) => [parameter.key, parameter]));
  for (const key of Object.keys(parameterValues)) if (!definitions.has(key)) throw new Error(`Unknown composition parameter: ${key}`);
  const values = new Map<string, z.infer<typeof jsonScalar>>();
  for (const parameter of manifest.parameters) {
    const value = Object.prototype.hasOwnProperty.call(parameterValues, parameter.key) ? parameterValues[parameter.key] : parameter.defaultValue;
    if (parameter.required && (value === null || value === "")) throw new Error(`${parameter.label} is required`);
    if (parameter.type === "number" && typeof value !== "number") throw new Error(`${parameter.label} must be a number`);
    if (parameter.type === "boolean" && typeof value !== "boolean") throw new Error(`${parameter.label} must be true or false`);
    if (["text", "color", "select"].includes(parameter.type) && typeof value !== "string") throw new Error(`${parameter.label} must be text`);
    if (parameter.type === "color" && typeof value === "string" && !color.safeParse(value).success) throw new Error(`${parameter.label} must be a six-digit hex color`);
    if (parameter.type === "select" && typeof value === "string" && !parameter.options?.includes(value)) throw new Error(`${parameter.label} must use an allowed option`);
    if (typeof value === "number" && parameter.minimum !== undefined && value < parameter.minimum) throw new Error(`${parameter.label} is below its minimum`);
    if (typeof value === "number" && parameter.maximum !== undefined && value > parameter.maximum) throw new Error(`${parameter.label} exceeds its maximum`);
    values.set(parameter.key, value);
  }
  const layers = manifest.layers.map((layer) => {
    let next = { ...layer, style: { ...layer.style } };
    for (const [target, parameterKey] of Object.entries(layer.dataBindings)) {
      if (!values.has(parameterKey)) throw new Error(`Layer ${layer.name} references unknown parameter ${parameterKey}`);
      const value = values.get(parameterKey)!;
      if (target === "text") {
        if (typeof value !== "string" && typeof value !== "number") throw new Error(`${parameterKey} cannot bind to layer text`);
        next = { ...next, text: String(value) };
      } else if (numericBindingTargets.has(target)) {
        if (typeof value !== "number") throw new Error(`${parameterKey} must be numeric for ${target}`);
        next = { ...next, [target]: value };
      } else if (target.startsWith("style.") && styleBindingTargets.has(target.slice(6))) {
        next = { ...next, style: { ...next.style, [target.slice(6)]: value } };
      } else throw new Error(`Unsupported composition binding target: ${target}`);
    }
    return next;
  });
  return cutCompositionManifestSchema.parse({ ...manifest, parameters: manifest.parameters.map((parameter) => ({ ...parameter, defaultValue: values.get(parameter.key)! })), layers });
}

function easingProgress(value: number, easing: z.infer<typeof cutCompositionKeyframeSchema>["easing"]) {
  return cutCompositionEasingProgress(value, easing);
}

function valueAtFrame(layer: z.infer<typeof cutCompositionLayerSchema>, property: string, frame: number, fallback: number) {
  const animation = layer.animations.find((item) => item.property === property);
  const keyframes = animation?.keyframes.filter((item) => typeof item.value === "number").sort((left, right) => left.frame - right.frame) ?? [];
  if (!keyframes.length) return fallback;
  const before = [...keyframes].reverse().find((item) => item.frame <= frame) ?? keyframes[0];
  const after = keyframes.find((item) => item.frame >= frame) ?? keyframes.at(-1)!;
  if (before.frame === after.frame) return before.value as number;
  const progress = easingProgress((frame - before.frame) / (after.frame - before.frame), after.easing);
  return (before.value as number) + ((after.value as number) - (before.value as number)) * progress;
}

type CutLayerReveal = { kind: "wipe" | "clock_wipe" | "iris" | "custom_mask"; progress: number; direction?: z.infer<typeof cutLayerTransitionSchema>["direction"]; maskAssetId?: string };

function transitionAtFrame(layer: z.infer<typeof cutCompositionLayerSchema>, localFrame: number): { opacity: number; x: number; y: number; scale: number; rotationY: number; reveal: CutLayerReveal | null } {
  let opacity = 1;
  let x = 0;
  let y = 0;
  let scale = 1;
  let rotationY = 0;
  let reveal: CutLayerReveal | null = null;
  const apply = (transition: z.infer<typeof cutLayerTransitionSchema>, progress: number, entering: boolean) => {
    if (transition.kind === "none" || transition.durationInFrames === 0) return;
    const eased = easingProgress(progress, transition.easing);
    const visible = entering ? eased : 1 - eased;
    if (transition.kind === "fade" || transition.kind === "custom_mask") opacity *= visible;
    if (["wipe", "clock_wipe", "iris", "custom_mask"].includes(transition.kind)) reveal = { kind: transition.kind as CutLayerReveal["kind"], progress: visible, direction: transition.direction, maskAssetId: transition.maskAssetId };
    if (transition.kind === "zoom") scale *= .72 + (.28 * visible);
    if (transition.kind === "flip") rotationY += (1 - visible) * (transition.direction === "left" || transition.direction === "counterclockwise" ? -90 : 90);
    if (transition.kind === "slide") {
      const offset = (1 - visible) * .24;
      if (transition.direction === "left") x -= offset;
      else if (transition.direction === "up") y -= offset;
      else if (transition.direction === "down") y += offset;
      else x += offset;
    }
  };
  if (layer.enter && localFrame < layer.enter.durationInFrames) apply(layer.enter, localFrame / Math.max(1, layer.enter.durationInFrames), true);
  if (layer.exit && localFrame >= layer.durationInFrames - layer.exit.durationInFrames) apply(layer.exit, (localFrame - (layer.durationInFrames - layer.exit.durationInFrames)) / Math.max(1, layer.exit.durationInFrames), false);
  return { opacity, x, y, scale, rotationY, reveal };
}

// Internal fast path: callers must first validate the complete manifest.
// Sampling one layer must not reparse/evaluate every other layer for each point.
function evaluateValidatedLayerFrame(layer: CutCompositionManifest["layers"][number], localFrame: number) {
  const transition = transitionAtFrame(layer, localFrame);
  return {
    id: layer.id,
    kind: layer.kind,
    localFrame,
    sourceFrame: layer.sourceStartFrame + localFrame,
    x: valueAtFrame(layer, "x", localFrame, layer.x) + transition.x,
    y: valueAtFrame(layer, "y", localFrame, layer.y) + transition.y,
    scale: valueAtFrame(layer, "scale", localFrame, 1) * transition.scale,
    rotation: valueAtFrame(layer, "rotation", localFrame, layer.rotation),
    rotationX: valueAtFrame(layer, "rotationX", localFrame, layer.rotationX),
    rotationY: valueAtFrame(layer, "rotationY", localFrame, layer.rotationY) + transition.rotationY,
    perspective: Math.max(0, valueAtFrame(layer, "perspective", localFrame, layer.perspective)),
    opacity: Math.max(0, Math.min(1, valueAtFrame(layer, "opacity", localFrame, layer.opacity) * transition.opacity)),
    volume: Math.max(0, Math.min(2, valueAtFrame(layer, "volume", localFrame, layer.volume))),
    blur: Math.max(0, valueAtFrame(layer, "blur", localFrame, 0)),
    brightness: Math.max(0, valueAtFrame(layer, "brightness", localFrame, 1)),
    saturation: Math.max(0, valueAtFrame(layer, "saturation", localFrame, 1)),
    reveal: transition.reveal,
    effects: layer.effects.filter((effect) => effect.enabled),
  };
}

export function evaluateCompositionFrame(manifestInput: unknown, frame: number) {
  const manifest = cutCompositionManifestSchema.parse(manifestInput);
  const boundedFrame = Math.max(0, Math.min(manifest.durationInFrames - 1, Math.floor(frame)));
  return manifest.layers.filter((layer) => boundedFrame >= layer.from && boundedFrame < layer.from + layer.durationInFrames)
    .map((layer) => evaluateValidatedLayerFrame(layer, boundedFrame - layer.from));
}

function sampledGraphicMotion(manifest: CutCompositionManifest, layer: CutCompositionManifest["layers"][number]) {
  const finalFrame = Math.max(0, layer.durationInFrames - 1);
  const important = new Set<number>([0, finalFrame]);
  for (const animation of layer.animations) {
    if (["x", "y", "scale", "rotation", "rotationX", "rotationY", "perspective", "opacity", "blur", "brightness", "saturation"].includes(animation.property)) {
      for (const keyframe of animation.keyframes) {
        important.add(Math.max(0, Math.min(finalFrame, keyframe.frame)));
        // Preserve the last held composition frame before a step changes.
        // A sparse linear sample must not turn an authored cut into a glide.
        if (keyframe.easing === "step" && keyframe.frame > 0 && keyframe.frame <= finalFrame) important.add(keyframe.frame - 1);
      }
    }
  }
  if (layer.enter) important.add(Math.max(0, Math.min(finalFrame, layer.enter.durationInFrames)));
  if (layer.exit) important.add(Math.max(0, Math.min(finalFrame, layer.durationInFrames - layer.exit.durationInFrames)));
  if (important.size > 50) throw new Error(`Layer ${layer.name} exceeds the native limit of 50 motion boundary frames; split the layer instead of dropping authored keyframes`);
  const candidate = Array.from(important).sort((left, right) => left - right);
  for (let index = 0; candidate.length < 12 && index < 10; index += 1) candidate.push(Math.round(finalFrame * index / 9));
  const ordered = Array.from(new Set(candidate)).sort((left, right) => left - right);
  // Keep every authored boundary. Extra samples still approximate nonlinear
  // easing; this is not a claim of general frame-exact curve interpolation.
  const frames = ordered;
  return Array.from(new Set(frames)).map((frame) => {
    const evaluated = evaluateValidatedLayerFrame(layer, frame);
    const revealKind = evaluated.reveal?.kind ?? null;
    return { at: frame / manifest.fps, x: evaluated.x, y: evaluated.y, scale: evaluated.scale, rotation: evaluated.rotation, rotationX: evaluated.rotationX, rotationY: evaluated.rotationY, perspective: evaluated.perspective, blur: evaluated.blur, brightness: evaluated.brightness, saturation: evaluated.saturation, opacity: evaluated.opacity, revealKind, revealDirection: evaluated.reveal?.direction && ["left", "right", "up", "down", "clockwise", "counterclockwise"].includes(evaluated.reveal.direction) ? evaluated.reveal.direction as "left" | "right" | "up" | "down" | "clockwise" | "counterclockwise" : null, revealProgress: evaluated.reveal?.progress ?? 1, revealMaskAssetId: evaluated.reveal?.maskAssetId ?? null, easing: "linear" as const };
  });
}

function graphicCurves(manifest: CutCompositionManifest, layer: CutCompositionManifest["layers"][number]): CutGraphicCurves | undefined {
  // The legacy projected-3D path has different scale timing. Do not imply that
  // exact scalar curves repair perspective/3D frame fidelity in that path.
  if (layer.rotationX || layer.rotationY || layer.animations.some((animation) => ["rotationX", "rotationY"].includes(animation.property)) || layer.enter?.kind === "flip" || layer.exit?.kind === "flip") return undefined;
  const transitions: CutGraphicCurves["transitions"] = [];
  for (const phase of ["enter", "exit"] as const) {
    const transition = layer[phase];
    if (!transition || !transition.durationInFrames || !["fade", "custom_mask", "slide", "zoom", "wipe", "clock_wipe", "iris"].includes(transition.kind)) continue;
    transitions.push({ phase, kind: transition.kind === "custom_mask" ? "fade" : transition.kind as "fade" | "slide" | "zoom" | "wipe" | "clock_wipe" | "iris", durationInFrames: transition.durationInFrames, easing: transition.easing,
      ...(transition.direction && ["left", "right", "up", "down"].includes(transition.direction) ? { direction: transition.direction as "left" | "right" | "up" | "down" } : {}) });
  }
  return cutGraphicCurvesSchema.parse({ version: 1, fps: manifest.fps, durationInFrames: layer.durationInFrames,
    curves: CUT_GRAPHIC_CURVE_PROPERTIES.map((property) => ({ property,
      base: property === "x" ? layer.x : property === "y" ? layer.y : property === "rotation" ? layer.rotation : property === "opacity" ? layer.opacity : 1,
      keyframes: (layer.animations.find((animation) => animation.property === property)?.keyframes ?? []).filter((point) => typeof point.value === "number").sort((left, right) => left.frame - right.frame),
    })), transitions });
}

export function compileCompositionToEdl(manifestInput: unknown, baseEdl: CutEdl, options: CutCompositionExpansionOptions = {}): CutEdl {
  const manifest = expandNestedCompositionManifest(manifestInput, options);
  const fps = manifest.fps;
  // Reject unsupported or conflicting masks before admitting a native render,
  // rather than silently dropping them from media layers or failing much later.
  for (const layer of manifest.layers) cutLayerMaskAsset(layer);
  const mediaTrackCounts = { video: 0, audio: 0 };
  const clips = manifest.layers.flatMap((layer) => {
    if (!layer.assetId || (layer.kind !== "video" && layer.kind !== "audio")) return [];
    // Native media composition surfaces preserve bounded 2D rotation motion;
    // 3D media transforms remain outside this renderer's contract.
    const sourceStart = layer.sourceStartFrame / fps;
    const duration = layer.durationInFrames / fps;
    const trackPrefix = layer.kind === "audio" ? "a" : "v";
    mediaTrackCounts[layer.kind] += 1;
    const trackIndex = Math.min(8, mediaTrackCounts[layer.kind]);
    const motion = layer.animations.filter((item) => ["x", "y", "scale", "opacity", "rotation", "rotationX", "rotationY", "perspective", "brightness", "saturation"].includes(item.property));
    const frames = Array.from(new Set(motion.flatMap((item) => item.keyframes.map((keyframe) => keyframe.frame)))).sort((a, b) => a - b);
    const easingAt = (property: "x" | "y" | "scale" | "opacity" | "rotation" | "rotationX" | "rotationY" | "perspective" | "brightness" | "saturation", frame: number): CutMotionEasing =>
      layer.animations.find((animation) => animation.property === property)?.keyframes.find((keyframe) => keyframe.frame === frame)?.easing ?? "linear";
    return [{
      id: layer.id,
      start: sourceStart,
      end: sourceStart + duration,
      label: layer.name,
      assetId: layer.assetId,
      ...(layer.kind === "video" && cutLayerMaskAsset(layer) ? { maskAssetId: cutLayerMaskAsset(layer)! } : {}),
      track: `${trackPrefix}${trackIndex}`,
      timelineStart: layer.from / fps,
      volume: layer.volume,
      transform: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, opacity: layer.opacity, rotation: layer.rotation, rotationX: layer.rotationX, rotationY: layer.rotationY, perspective: layer.perspective, anchorX: layer.anchorX, anchorY: layer.anchorY },
      motionKeyframes: frames.slice(0, 50).map((frame) => ({
        at: frame / fps,
        x: valueAtFrame(layer, "x", frame, layer.x),
        y: valueAtFrame(layer, "y", frame, layer.y),
        scale: valueAtFrame(layer, "scale", frame, 1),
        opacity: valueAtFrame(layer, "opacity", frame, layer.opacity),
        rotation: valueAtFrame(layer, "rotation", frame, layer.rotation),
        rotationX: valueAtFrame(layer, "rotationX", frame, layer.rotationX),
        rotationY: valueAtFrame(layer, "rotationY", frame, layer.rotationY),
        perspective: valueAtFrame(layer, "perspective", frame, layer.perspective),
        brightness: valueAtFrame(layer, "brightness", frame, 1),
        saturation: valueAtFrame(layer, "saturation", frame, 1),
        // Preserve each authored property curve. The generic legacy field is
        // neutral, so readers that have not adopted per-property easing do not
        // get a fabricated shared curve.
        easing: "linear" as const,
        xEasing: easingAt("x", frame),
        yEasing: easingAt("y", frame),
        scaleEasing: easingAt("scale", frame),
        opacityEasing: easingAt("opacity", frame),
        rotationEasing: easingAt("rotation", frame),
        rotationXEasing: easingAt("rotationX", frame),
        rotationYEasing: easingAt("rotationY", frame),
        perspectiveEasing: easingAt("perspective", frame),
        brightnessEasing: easingAt("brightness", frame),
        saturationEasing: easingAt("saturation", frame),
      })),
    }];
  });
  const graphics = manifest.layers.flatMap((layer) => {
    if (!["text", "caption", "data", "shape", "path", "svg", "image", "lottie", "rive", "three"].includes(layer.kind) || (!["shape", "image", "lottie", "rive", "three"].includes(layer.kind) && !layer.text) || (["image", "lottie", "rive"].includes(layer.kind) && !layer.assetId)) return [];
    const initialState = evaluateValidatedLayerFrame(layer, 0);
    const transitionMaskIds = Array.from(new Set([layer.enter?.kind === "custom_mask" ? layer.enter.maskAssetId : undefined, layer.exit?.kind === "custom_mask" ? layer.exit.maskAssetId : undefined].filter((value): value is string => Boolean(value))));
    const selectedFont = typeof layer.style.fontFamily === "string" ? manifest.fonts.find((font) => font.family === layer.style.fontFamily) : undefined;
    if (transitionMaskIds.length > 1) throw new Error("A graphic layer must use one custom mask asset across its transitions");
    const three = layer.kind === "three" ? parseCutThreePrimitiveStyle(layer.style) : null;
    const motionKeyframes = sampledGraphicMotion(manifest, layer);
    return [{
      id: layer.id,
      kind: layer.kind === "caption" ? "callout" as const : layer.kind === "shape" ? "shape" as const : layer.kind === "path" ? "path" as const : layer.kind === "svg" ? "svg" as const : layer.kind === "image" ? "image" as const : layer.kind === "lottie" ? "lottie" as const : layer.kind === "rive" ? "rive" as const : layer.kind === "three" ? "three" as const : "title" as const,
      assetId: layer.assetId,
      ...(["lottie", "rive"].includes(layer.kind) && layer.sourceStartFrame > 0 ? { animationSourceStartSeconds: layer.sourceStartFrame / fps } : {}),
      text: layer.kind === "svg" ? sanitizeCutStudioSvg(layer.text ?? "") : layer.text ?? "",
      timelineStart: layer.from / fps,
      duration: layer.durationInFrames / fps,
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      anchorX: layer.anchorX,
      anchorY: layer.anchorY,
      fontSize: Math.max(12, Math.min(160, Number(layer.style.fontSize) || 48)),
      fontReferenceWidth: manifest.width,
      imageFit: layer.kind === "image" ? cutImageFit(layer.style.objectFit) : "contain" as const,
      textLayout: ["text", "caption", "data"].includes(layer.kind) ? resolveCutTextLayout(layer.style, selectedFont?.assetId ? selectedFont : undefined) : undefined,
      fontAssetId: selectedFont?.assetId,
      fontFamily: selectedFont?.family ?? "CreativesOS Sans",
      textColor: three?.edgeColor ?? (typeof (layer.kind === "path" ? layer.style.stroke ?? layer.style.color : layer.style.color) === "string" && color.safeParse(layer.kind === "path" ? layer.style.stroke ?? layer.style.color : layer.style.color).success ? String(layer.kind === "path" ? layer.style.stroke ?? layer.style.color : layer.style.color) : layer.kind === "data" ? "#1d9bf0" : "#ffffff"),
      backgroundColor: three?.color ?? (typeof (layer.kind === "shape" ? layer.style.fill : layer.style.backgroundColor) === "string" && color.safeParse(layer.kind === "shape" ? layer.style.fill : layer.style.backgroundColor).success ? String(layer.kind === "shape" ? layer.style.fill : layer.style.backgroundColor) : layer.kind === "data" ? "#1d9bf0" : "#000000"),
      backgroundOpacity: layer.kind === "shape" || layer.kind === "path" ? layer.opacity : ["text", "caption"].includes(layer.kind) && !layer.style.backgroundColor ? 0 : typeof layer.style.backgroundOpacity === "number" ? Math.max(0, Math.min(1, layer.style.backgroundOpacity)) : layer.kind === "data" ? .15 : 0.72,
      fillColor: layer.kind === "path" && typeof layer.style.fill === "string" && color.safeParse(layer.style.fill).success ? layer.style.fill : null,
      strokeWidth: layer.kind === "path" && typeof layer.style.strokeWidth === "number" ? Math.max(.1, Math.min(20, layer.style.strokeWidth)) : 2,
      primitive: three?.primitive ?? null,
      secondaryColor: three?.secondaryColor ?? "#0b5f99",
      edgeColor: three?.edgeColor ?? "#ffffff",
      wireframe: three?.wireframe ?? false,
      depth: three?.depth ?? 1,
      borderRadius: layer.kind === "shape" && typeof layer.style.borderRadius === "number" ? Math.max(0, Math.min(50, layer.style.borderRadius)) : 0,
      rotation: layer.rotation,
      rotationX: layer.rotationX,
      rotationY: layer.rotationY,
      perspective: layer.perspective,
      blur: initialState?.blur ?? 0,
      brightness: initialState?.brightness ?? 1,
      saturation: initialState?.saturation ?? 1,
      revealKind: initialState?.reveal?.kind ?? null,
      revealDirection: initialState?.reveal?.direction && ["left", "right", "up", "down", "clockwise", "counterclockwise"].includes(initialState.reveal.direction) ? initialState.reveal.direction as "left" | "right" | "up" | "down" | "clockwise" | "counterclockwise" : null,
      revealProgress: initialState?.reveal?.progress ?? 1,
      revealMaskAssetId: cutLayerMaskAsset(layer),
      effects: layer.effects.filter((effect) => effect.enabled).slice(0, 20).map((effect) => ({ kind: effect.kind, parameters: effect.parameters })),
      motionKeyframes,
      compositionCurves: graphicCurves(manifest, layer),
    }];
  });
  if (!clips.length) throw new Error("A composition must contain at least one video or audio layer before it can be applied to the timeline");
  return {
    ...baseEdl,
    version: 3,
    clips: normalizeCutClips(clips, manifest.durationInFrames / fps, 3),
    graphics,
  };
}

export function cutGenerationProviderRegistry(environment: NodeJS.ProcessEnv = process.env) {
  const configured = new Set((environment.CUT_GENERATION_PROVIDERS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  return [
    { id: "openai", label: "OpenAI", configured: configured.has("openai") && Boolean(environment.OPENAI_API_KEY), capabilities: ["text_to_image", "image_to_image", "inpaint_image", "text_to_video", "image_to_video"] },
    { id: "google", label: "Google", configured: configured.has("google") && Boolean(environment.GOOGLE_AI_API_KEY), capabilities: ["text_to_image", "image_to_image", "text_to_video", "image_to_video", "first_last_frame", "extend_video", "native_audio"] },
    { id: "runway", label: "Runway", configured: configured.has("runway") && Boolean(environment.RUNWAY_API_KEY), capabilities: ["text_to_video", "image_to_video", "video_to_video", "extend_video", "motion_transfer", "lip_sync", "upscale_video"] },
    { id: "replicate", label: "Replicate", configured: configured.has("replicate") && Boolean(environment.REPLICATE_API_TOKEN), capabilities: ["model_router", "text_to_image", "image_to_image", "inpaint_image", "outpaint_image", "text_to_video", "image_to_video", "video_to_video", "lip_sync", "talking_avatar", "voice_clone", "music_generation", "sound_effect_generation", "audio_separation"] },
    { id: "self_hosted", label: "Self-hosted models", configured: configured.has("self_hosted") && Boolean(environment.CUT_GENERATION_BASE_URL), capabilities: ["model_router", "private_compute"] },
  ] as const;
}
