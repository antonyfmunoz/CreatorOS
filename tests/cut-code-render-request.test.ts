import { describe, expect, it } from "vitest";
import { cutCodeInputContractSchema, cutCodeRenderBatchSubmissionSchema, cutCodeRenderRequestSchema, cutCodeRenderSubmissionSchema, defaultCutCodeRenderFormat, normalizeCutCodeRenderInput } from "../shared/cut-code-render";

const base = { width: 1920, height: 1080, fps: 30, durationInFrames: 120, input: {} };

describe("CutStudio local code-render request contract", () => {
  it("accepts bounded still, video, and frame-sequence exports", () => {
    expect(cutCodeRenderRequestSchema.parse({ ...base, mode: "still", frame: 42, format: "webp" })).toMatchObject({ mode: "still", frame: 42, format: "webp" });
    expect(cutCodeRenderRequestSchema.parse({ ...base, mode: "video", frameRange: [0, 119], format: "mp4" })).toMatchObject({ mode: "video", frameRange: [0, 119], format: "mp4" });
    expect(cutCodeRenderRequestSchema.parse({ ...base, mode: "sequence", frameRange: [20, 45], format: "png" })).toMatchObject({ mode: "sequence", frameRange: [20, 45], format: "png" });
  });

  it("rejects mode-format mismatches and invalid frame selection", () => {
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "still", frame: 120, format: "png" }).success).toBe(false);
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "still", frame: 1, format: "mp4" }).success).toBe(false);
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "video", frameRange: [90, 120], format: "mp4" }).success).toBe(false);
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "sequence", frameRange: [0, 30], format: "gif" }).success).toBe(false);
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "video", frameRange: [0, 30], format: "mp4", quality: 90 }).success).toBe(false);
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "still", frame: 1, format: "webp", quality: 90 }).success).toBe(true);
  });

  it("holds the resource and input ceilings before durable work is queued", () => {
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "video", width: 3840, height: 2160, frameRange: [0, 1], format: "webm" }).success).toBe(true);
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "video", width: 3840, height: 2161, frameRange: [0, 1], format: "webm" }).success).toBe(false);
    expect(cutCodeRenderRequestSchema.safeParse({ ...base, mode: "video", frameRange: [0, 1], format: "webm", input: { value: "x".repeat(64_000) } }).success).toBe(false);
  });

  it("keeps submissions idempotency-keyed and chooses safe defaults", () => {
    expect(defaultCutCodeRenderFormat("still")).toBe("png");
    expect(defaultCutCodeRenderFormat("video")).toBe("mp4");
    expect(defaultCutCodeRenderFormat("sequence")).toBe("png");
    expect(cutCodeRenderSubmissionSchema.safeParse({ idempotencyKey: "code.12345678", request: { ...base, mode: "still", frame: 0, format: "png" } }).success).toBe(true);
  });

  it("accepts only bounded, distinct batch inputs", () => {
    const still = { ...base, mode: "still" as const, frame: 0, format: "png" as const };
    expect(cutCodeRenderBatchSubmissionSchema.safeParse({ idempotencyKey: "code-batch.12345678", requests: [still, { ...still, input: { headline: "Second" } }] }).success).toBe(true);
    expect(cutCodeRenderBatchSubmissionSchema.safeParse({ idempotencyKey: "code-batch.12345678", requests: [still] }).success).toBe(false);
    expect(cutCodeRenderBatchSubmissionSchema.safeParse({ idempotencyKey: "code-batch.12345678", requests: [still, still] }).success).toBe(false);
  });

  it("normalizes declared typed composition inputs and rejects undeclared data", () => {
    const contract = cutCodeInputContractSchema.parse({ version: 1, fields: {
      headline: { type: "string", required: true, maxLength: 80 },
      hue: { type: "number", minimum: 0, maximum: 360, default: 210 },
      showLogo: { type: "boolean", default: true },
    } });
    expect(normalizeCutCodeRenderInput({ headline: "Launch" }, contract)).toEqual({ headline: "Launch", hue: 210, showLogo: true });
    expect(() => normalizeCutCodeRenderInput({ headline: "Launch", hidden: "no" }, contract)).toThrow("not declared");
    expect(() => normalizeCutCodeRenderInput({ headline: "Launch", hue: 361 }, contract)).toThrow("exceeds its maximum");
    expect(() => normalizeCutCodeRenderInput({ hue: 120 }, contract)).toThrow("required");
  });
});
