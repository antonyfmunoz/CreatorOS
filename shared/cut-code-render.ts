import { z } from "zod";

export const cutCodeRenderModes = ["still", "video", "sequence", "audio"] as const;
export type CutCodeRenderMode = typeof cutCodeRenderModes[number];

export const cutCodeRenderFormats = {
  still: ["png", "jpeg", "webp"],
  video: ["mp4", "webm", "gif", "mov"],
  sequence: ["png", "jpeg", "webp"],
  audio: ["wav", "mp3", "m4a"],
} as const;

const cutCodeMp4Presets = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"] as const;
export const cutCodeVideoEncodingSchema = z.object({
  crf: z.number().int().optional(),
  bitrateKbps: z.number().int().optional(),
  preset: z.enum(cutCodeMp4Presets).optional(),
  cpuUsed: z.number().int().min(0).max(8).optional(),
  losslessRgb: z.boolean().optional(),
}).strict();

// GIF is an image sequence, not a general video encoder. Keep its two
// sampling/loop controls narrow so a request can be validated identically by
// the product API and the isolated local runtime.
export const cutCodeGifOptionsSchema = z.object({
  frameStep: z.number().int().min(1).max(30).optional(),
  repeatCount: z.number().int().min(0).max(1_000).nullable().optional(),
}).strict();

const cutCodeInputKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const cutCodeInputFieldBase = { label: z.string().trim().min(1).max(80).optional(), required: z.boolean().default(false) };
export const cutCodeInputFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...cutCodeInputFieldBase, type: z.literal("string"), default: z.string().max(2_000).optional(), minLength: z.number().int().min(0).max(2_000).optional(), maxLength: z.number().int().min(0).max(2_000).optional(), pattern: z.string().min(1).max(240).optional(), options: z.array(z.string().max(2_000)).min(1).max(100).optional() }).strict(),
  z.object({ ...cutCodeInputFieldBase, type: z.literal("number"), default: z.number().finite().optional(), minimum: z.number().finite().optional(), maximum: z.number().finite().optional() }).strict(),
  z.object({ ...cutCodeInputFieldBase, type: z.literal("boolean"), default: z.boolean().optional() }).strict(),
]).superRefine((field, context) => {
  if (field.type === "string") {
    if (field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) context.addIssue({ code: z.ZodIssueCode.custom, message: "String minimum cannot exceed maximum" });
    if (field.pattern) { try { new RegExp(field.pattern, "u"); } catch { context.addIssue({ code: z.ZodIssueCode.custom, path: ["pattern"], message: "String pattern must be a valid Unicode regular expression" }); } }
    if (field.default !== undefined && field.options && !field.options.includes(field.default)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["default"], message: "String default must be one of the allowed options" });
  }
  if (field.type === "number" && field.minimum !== undefined && field.maximum !== undefined && field.minimum > field.maximum) context.addIssue({ code: z.ZodIssueCode.custom, message: "Number minimum cannot exceed maximum" });
});
export const cutCodeInputContractSchema = z.object({
  version: z.literal(1),
  fields: z.record(cutCodeInputKey, cutCodeInputFieldSchema).superRefine((fields, context) => { if (Object.keys(fields).length > 50) context.addIssue({ code: z.ZodIssueCode.custom, message: "At most 50 composition input fields are allowed" }); }),
}).strict();
export type CutCodeInputContract = z.infer<typeof cutCodeInputContractSchema>;

// This is deliberately a small value contract, not an executable schema
// language. It rejects unexpected fields before an untrusted capsule sees them.
export function normalizeCutCodeRenderInput(input: Record<string, unknown>, contract: CutCodeInputContract | null | undefined) {
  if (!contract) return input;
  const output: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(input)) if (!(key in contract.fields)) throw new Error(`Composition input ${key} is not declared by this composition`);
  for (const [key, field] of Object.entries(contract.fields)) {
    const value = input[key];
    if (value === undefined) {
      if (field.default !== undefined) { output[key] = field.default; continue; }
      if (field.required) throw new Error(`Composition input ${key} is required`);
      continue;
    }
    if (field.type === "string") {
      if (typeof value !== "string") throw new Error(`Composition input ${key} must be text`);
      if (field.minLength !== undefined && value.length < field.minLength) throw new Error(`Composition input ${key} is shorter than its minimum`);
      if (field.maxLength !== undefined && value.length > field.maxLength) throw new Error(`Composition input ${key} exceeds its maximum length`);
      if (field.options && !field.options.includes(value)) throw new Error(`Composition input ${key} is not an allowed option`);
      if (field.pattern && !(new RegExp(field.pattern, "u")).test(value)) throw new Error(`Composition input ${key} does not match its required pattern`);
      output[key] = value;
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Composition input ${key} must be a finite number`);
      if (field.minimum !== undefined && value < field.minimum) throw new Error(`Composition input ${key} is below its minimum`);
      if (field.maximum !== undefined && value > field.maximum) throw new Error(`Composition input ${key} exceeds its maximum`);
      output[key] = value;
    } else {
      if (typeof value !== "boolean") throw new Error(`Composition input ${key} must be true or false`);
      output[key] = value;
    }
  }
  return output;
}

export const cutCodeRenderRequestSchema = z.object({
  mode: z.enum(cutCodeRenderModes),
  width: z.number().int().min(16).max(3_840),
  height: z.number().int().min(16).max(3_840),
  fps: z.number().int().min(1).max(60),
  durationInFrames: z.number().int().min(1).max(600),
  frame: z.number().int().min(0).optional(),
  frameRange: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  format: z.enum(["png", "jpeg", "webp", "mp4", "webm", "gif", "mov", "wav", "mp3", "m4a"]).optional(),
  gifOptions: cutCodeGifOptionsSchema.optional(),
  proresProfile: z.enum(["422hq", "4444", "4444xq"]).optional(),
  videoEncoding: cutCodeVideoEncodingSchema.optional(),
  quality: z.number().int().min(1).max(100).optional(),
  input: z.record(z.unknown()).default({}),
}).strict().superRefine((request, context) => {
  if (request.width * request.height > 3_840 * 2_160) context.addIssue({ code: z.ZodIssueCode.custom, message: "Output dimensions exceed the isolated renderer limit" });
  if (request.mode === "still") {
    if (request.frame === undefined || request.frame >= request.durationInFrames || request.frameRange !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: "A still export requires one valid frame" });
    if (request.format && !cutCodeRenderFormats.still.includes(request.format as never)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["format"], message: "Unsupported still format" });
  } else {
    const range = request.frameRange ?? [0, request.durationInFrames - 1];
    if (range[1] < range[0] || range[1] >= request.durationInFrames) context.addIssue({ code: z.ZodIssueCode.custom, path: ["frameRange"], message: "The frame range is outside the composition" });
    const formats = cutCodeRenderFormats[request.mode];
    if (request.format && !formats.includes(request.format as never)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["format"], message: `Unsupported ${request.mode} format` });
  }
  const resolvedFormat = request.format ?? defaultCutCodeRenderFormat(request.mode);
  if (request.gifOptions !== undefined) {
    if (request.mode !== "video" || resolvedFormat !== "gif") context.addIssue({ code: z.ZodIssueCode.custom, path: ["gifOptions"], message: "GIF sampling controls require GIF video output" });
    const range = request.frameRange ?? [0, request.durationInFrames - 1];
    if (request.fps > 50 || request.width * request.height * (range[1] - range[0] + 1) > 100_000_000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["gifOptions"], message: "GIF exceeds its frame-rate or palette memory budget" });
  }
  if (request.quality !== undefined && !["jpeg", "webp"].includes(resolvedFormat)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["quality"], message: "Quality is supported only for JPEG/WebP output" });
  if (request.proresProfile !== undefined && resolvedFormat !== "mov") context.addIssue({ code: z.ZodIssueCode.custom, path: ["proresProfile"], message: "A ProRes profile requires MOV output" });
  if (request.videoEncoding) {
    const encoding = request.videoEncoding;
    if (request.mode !== "video" || !["mp4", "webm"].includes(resolvedFormat)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videoEncoding"], message: "Video encoding controls require MP4 or WebM video output" });
    if (encoding.losslessRgb) {
      if (resolvedFormat !== "mp4" || encoding.crf !== undefined || encoding.bitrateKbps !== undefined || encoding.cpuUsed !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videoEncoding"], message: "Lossless RGB requires MP4 without CRF, bitrate, or CPU overrides" });
    } else {
      if (encoding.crf !== undefined && encoding.bitrateKbps !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videoEncoding"], message: "Choose constant quality or a target bitrate, not both" });
      if (encoding.bitrateKbps !== undefined && (encoding.bitrateKbps < 64 || encoding.bitrateKbps > 100_000)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videoEncoding", "bitrateKbps"], message: "Video bitrate must be within 64–100000 Kbps" });
      if (encoding.crf !== undefined && (encoding.crf < (resolvedFormat === "mp4" ? 1 : 0) || encoding.crf > (resolvedFormat === "mp4" ? 51 : 63))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videoEncoding", "crf"], message: "CRF is outside the selected codec range" });
      if (resolvedFormat === "mp4" && encoding.cpuUsed !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videoEncoding", "cpuUsed"], message: "WebM CPU usage does not apply to MP4" });
      if (resolvedFormat === "webm" && encoding.preset !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["videoEncoding", "preset"], message: "MP4 presets do not apply to WebM" });
    }
  }
  if (JSON.stringify(request.input).length > 64_000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["input"], message: "Composition inputs exceed 64 KiB" });
});

export type CutCodeRenderRequest = z.infer<typeof cutCodeRenderRequestSchema>;

export const cutCodeRenderSubmissionSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/),
  request: cutCodeRenderRequestSchema,
});

export type CutCodeRenderSubmission = z.infer<typeof cutCodeRenderSubmissionSchema>;

// A batch is intentionally only an array of independently bounded render
// requests. The broker still leases exactly one job to each paired device, so
// batch submission cannot turn a workstation into an unbounded executor.
export const cutCodeRenderBatchSubmissionSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/),
  requests: z.array(cutCodeRenderRequestSchema).min(2).max(20),
}).strict().superRefine((value, context) => {
  const identities = value.requests.map((request) => JSON.stringify(request));
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["requests"], message: "Every batch render must have distinct settings or composition input" });
  }
});

export type CutCodeRenderBatchSubmission = z.infer<typeof cutCodeRenderBatchSubmissionSchema>;

export function defaultCutCodeRenderFormat(mode: CutCodeRenderMode) {
  return cutCodeRenderFormats[mode][0];
}
