import { z } from "zod";

export const cutCodeRenderModes = ["still", "video", "sequence"] as const;
export type CutCodeRenderMode = typeof cutCodeRenderModes[number];

export const cutCodeRenderFormats = {
  still: ["png", "jpeg", "webp"],
  video: ["mp4", "webm", "gif"],
  sequence: ["png", "jpeg", "webp"],
} as const;

export const cutCodeRenderRequestSchema = z.object({
  mode: z.enum(cutCodeRenderModes),
  width: z.number().int().min(16).max(3_840),
  height: z.number().int().min(16).max(3_840),
  fps: z.number().int().min(1).max(60),
  durationInFrames: z.number().int().min(1).max(600),
  frame: z.number().int().min(0).optional(),
  frameRange: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  format: z.enum(["png", "jpeg", "webp", "mp4", "webm", "gif"]).optional(),
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
  if (request.quality !== undefined && !["jpeg", "webp"].includes(resolvedFormat)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["quality"], message: "Quality is supported only for JPEG/WebP output" });
  if (JSON.stringify(request.input).length > 64_000) context.addIssue({ code: z.ZodIssueCode.custom, path: ["input"], message: "Composition inputs exceed 64 KiB" });
});

export type CutCodeRenderRequest = z.infer<typeof cutCodeRenderRequestSchema>;

export const cutCodeRenderSubmissionSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,160}$/),
  request: cutCodeRenderRequestSchema,
});

export type CutCodeRenderSubmission = z.infer<typeof cutCodeRenderSubmissionSchema>;

export function defaultCutCodeRenderFormat(mode: CutCodeRenderMode) {
  return cutCodeRenderFormats[mode][0];
}
