import { z } from "zod";
import { normalizeCutClips, type CutEdl } from "./cut-studio";
import { sanitizeCutStudioSvg } from "./cut-studio-svg";

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
  kind: z.enum(["video", "audio", "image", "text", "shape", "svg", "path", "caption", "lottie", "rive", "three", "data"]),
  name: z.string().trim().min(1).max(120),
  from: z.number().int().min(0).max(2_592_000),
  durationInFrames: z.number().int().positive().max(2_592_000),
  assetId: z.string().uuid().optional(),
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
  if (["video", "audio", "image", "lottie"].includes(value.kind) && !value.assetId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assetId"], message: `${value.kind} layers require an asset` });
  if (["text", "caption", "svg", "path"].includes(value.kind) && !value.text?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: `${value.kind} layers require source text or path data` });
  if (value.kind === "path" && value.text && (value.text.length > 4_000 || !/^[MmLlHhVvCcSsQqTtAaZz0-9+.,\s-]+$/.test(value.text))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "Vector paths may contain only bounded SVG path commands and numbers" });
  if (value.kind === "svg" && value.text) {
    try { sanitizeCutStudioSvg(value.text); } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: error instanceof Error ? error.message : "SVG source is invalid" });
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
  maximumCpuMs: z.number().int().min(100).max(120_000).default(10_000),
  maximumMemoryMb: z.number().int().min(128).max(4_096).default(512),
  maximumOutputBytes: z.number().int().min(1_024).max(1_073_741_824).default(268_435_456),
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
  const progress = Math.max(0, Math.min(1, value));
  if (easing === "step") return progress < 1 ? 0 : 1;
  if (easing === "ease_in") return progress * progress;
  if (easing === "ease_out") return 1 - (1 - progress) ** 2;
  if (easing === "ease_in_out") return progress < .5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
  if (easing === "spring") return Math.max(0, Math.min(1, 1 - Math.exp(-7 * progress) * Math.cos(10 * progress)));
  return progress;
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

export function evaluateCompositionFrame(manifestInput: unknown, frame: number) {
  const manifest = cutCompositionManifestSchema.parse(manifestInput);
  const boundedFrame = Math.max(0, Math.min(manifest.durationInFrames - 1, Math.floor(frame)));
  return manifest.layers.filter((layer) => boundedFrame >= layer.from && boundedFrame < layer.from + layer.durationInFrames).map((layer) => {
    const localFrame = boundedFrame - layer.from;
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
  });
}

function sampledGraphicMotion(manifest: CutCompositionManifest, layer: CutCompositionManifest["layers"][number]) {
  const finalFrame = Math.max(0, layer.durationInFrames - 1);
  const important = new Set<number>([0, finalFrame]);
  for (const animation of layer.animations) {
    if (["x", "y", "scale", "rotation", "rotationX", "rotationY", "perspective", "opacity", "blur", "brightness", "saturation"].includes(animation.property)) {
      for (const keyframe of animation.keyframes) important.add(Math.max(0, Math.min(finalFrame, keyframe.frame)));
    }
  }
  if (layer.enter) important.add(Math.max(0, Math.min(finalFrame, layer.enter.durationInFrames)));
  if (layer.exit) important.add(Math.max(0, Math.min(finalFrame, layer.durationInFrames - layer.exit.durationInFrames)));
  const candidate = Array.from(important).sort((left, right) => left - right);
  for (let index = 0; candidate.length < 12 && index < 10; index += 1) candidate.push(Math.round(finalFrame * index / 9));
  const ordered = Array.from(new Set(candidate)).sort((left, right) => left - right);
  const frames = ordered.length <= 12 ? ordered : Array.from({ length: 12 }, (_, index) => ordered[Math.round(index * (ordered.length - 1) / 11)]);
  return Array.from(new Set(frames)).map((frame) => {
    const evaluated = evaluateCompositionFrame(manifest, layer.from + frame).find((item) => item.id === layer.id);
    if (!evaluated) throw new Error(`Composition layer ${layer.id} could not be evaluated for final rendering`);
    const revealKind = evaluated.reveal?.kind ?? null;
    return { at: frame / manifest.fps, x: evaluated.x, y: evaluated.y, scale: evaluated.scale, rotation: evaluated.rotation, rotationX: evaluated.rotationX, rotationY: evaluated.rotationY, perspective: evaluated.perspective, blur: evaluated.blur, brightness: evaluated.brightness, saturation: evaluated.saturation, opacity: evaluated.opacity, revealKind, revealDirection: evaluated.reveal?.direction && ["left", "right", "up", "down", "clockwise", "counterclockwise"].includes(evaluated.reveal.direction) ? evaluated.reveal.direction as "left" | "right" | "up" | "down" | "clockwise" | "counterclockwise" : null, revealProgress: evaluated.reveal?.progress ?? 1, revealMaskAssetId: evaluated.reveal?.maskAssetId ?? null, easing: "linear" as const };
  });
}

export function compileCompositionToEdl(manifestInput: unknown, baseEdl: CutEdl): CutEdl {
  const manifest = cutCompositionManifestSchema.parse(manifestInput);
  const fps = manifest.fps;
  const mediaTrackCounts = { video: 0, audio: 0 };
  const clips = manifest.layers.flatMap((layer) => {
    if (!layer.assetId || (layer.kind !== "video" && layer.kind !== "audio")) return [];
    const sourceStart = layer.sourceStartFrame / fps;
    const duration = layer.durationInFrames / fps;
    const trackPrefix = layer.kind === "audio" ? "a" : "v";
    mediaTrackCounts[layer.kind] += 1;
    const trackIndex = Math.min(8, mediaTrackCounts[layer.kind]);
    const motion = layer.animations.filter((item) => ["x", "y", "scale", "opacity"].includes(item.property));
    const frames = Array.from(new Set(motion.flatMap((item) => item.keyframes.map((keyframe) => keyframe.frame)))).sort((a, b) => a - b);
    return [{
      id: layer.id,
      start: sourceStart,
      end: sourceStart + duration,
      label: layer.name,
      assetId: layer.assetId,
      track: `${trackPrefix}${trackIndex}`,
      timelineStart: layer.from / fps,
      volume: layer.volume,
      transform: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, opacity: layer.opacity },
      motionKeyframes: frames.slice(0, 50).map((frame) => ({
        at: frame / fps,
        x: valueAtFrame(layer, "x", frame, layer.x),
        y: valueAtFrame(layer, "y", frame, layer.y),
        scale: valueAtFrame(layer, "scale", frame, 1),
        opacity: valueAtFrame(layer, "opacity", frame, layer.opacity),
        easing: "ease_in_out" as const,
      })),
    }];
  });
  const graphics = manifest.layers.flatMap((layer) => {
    if (!["text", "caption", "shape", "path", "svg", "image"].includes(layer.kind) || (!["shape", "image"].includes(layer.kind) && !layer.text) || (layer.kind === "image" && !layer.assetId)) return [];
    const graphicX = Math.max(0, Math.min(0.95, layer.x));
    const graphicY = Math.max(0, Math.min(0.95, layer.y));
    const initialState = evaluateCompositionFrame(manifest, layer.from).find((item) => item.id === layer.id);
    const transitionMaskIds = Array.from(new Set([layer.enter?.kind === "custom_mask" ? layer.enter.maskAssetId : undefined, layer.exit?.kind === "custom_mask" ? layer.exit.maskAssetId : undefined].filter((value): value is string => Boolean(value))));
    const selectedFont = typeof layer.style.fontFamily === "string" ? manifest.fonts.find((font) => font.family === layer.style.fontFamily) : undefined;
    if (transitionMaskIds.length > 1) throw new Error("A graphic layer must use one custom mask asset across its transitions");
    return [{
      id: layer.id,
      kind: layer.kind === "caption" ? "callout" as const : layer.kind === "shape" ? "shape" as const : layer.kind === "path" ? "path" as const : layer.kind === "svg" ? "svg" as const : layer.kind === "image" ? "image" as const : "title" as const,
      assetId: layer.assetId,
      text: layer.kind === "svg" ? sanitizeCutStudioSvg(layer.text ?? "") : layer.text ?? "",
      timelineStart: layer.from / fps,
      duration: layer.durationInFrames / fps,
      x: graphicX,
      y: graphicY,
      width: Math.max(.01, Math.min(1 - graphicX, layer.width)),
      height: Math.max(.01, Math.min(1 - graphicY, layer.height)),
      fontSize: Math.max(12, Math.min(160, Number(layer.style.fontSize) || 48)),
      fontAssetId: selectedFont?.assetId,
      fontFamily: selectedFont?.family ?? "CreativesOS Sans",
      textColor: typeof (layer.kind === "path" ? layer.style.stroke ?? layer.style.color : layer.style.color) === "string" && color.safeParse(layer.kind === "path" ? layer.style.stroke ?? layer.style.color : layer.style.color).success ? String(layer.kind === "path" ? layer.style.stroke ?? layer.style.color : layer.style.color) : "#ffffff",
      backgroundColor: typeof (layer.kind === "shape" ? layer.style.fill : layer.style.backgroundColor) === "string" && color.safeParse(layer.kind === "shape" ? layer.style.fill : layer.style.backgroundColor).success ? String(layer.kind === "shape" ? layer.style.fill : layer.style.backgroundColor) : "#000000",
      backgroundOpacity: layer.kind === "shape" || layer.kind === "path" ? layer.opacity : typeof layer.style.backgroundOpacity === "number" ? Math.max(0, Math.min(1, layer.style.backgroundOpacity)) : 0.72,
      fillColor: layer.kind === "path" && typeof layer.style.fill === "string" && color.safeParse(layer.style.fill).success ? layer.style.fill : null,
      strokeWidth: layer.kind === "path" && typeof layer.style.strokeWidth === "number" ? Math.max(.1, Math.min(20, layer.style.strokeWidth)) : 2,
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
      revealMaskAssetId: transitionMaskIds[0] ?? null,
      effects: layer.effects.filter((effect) => effect.enabled).slice(0, 20).map((effect) => ({ kind: effect.kind, parameters: effect.parameters })),
      motionKeyframes: sampledGraphicMotion(manifest, layer),
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
