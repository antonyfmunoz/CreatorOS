import { z } from "zod";

export const visionSourceSchema = z.enum(["camera", "screen"]);
export const visionQualitySchema = z.enum(["smooth", "balanced", "high", "analysis"]);
export const visionSessionStatusSchema = z.enum(["ready", "live", "stopped", "archived"]);
export const visionWatchConditionSchema = z.enum(["moved", "appeared", "disappeared", "activity_changed"]);

export const visionQualityProfiles = {
  smooth: { width: 1280, height: 720, fps: 30, priority: "motion" },
  balanced: { width: 1280, height: 720, fps: 30, priority: "latency_quality" },
  high: { width: 1920, height: 1080, fps: 30, priority: "image_quality" },
  analysis: { width: 1920, height: 1080, fps: 5, priority: "grounded_snapshot" },
} as const;

export const createVisionSessionSchema = z.object({
  title: z.string().trim().min(1).max(160).default("Untitled capture"),
  source: visionSourceSchema.default("camera"),
  quality: visionQualitySchema.default("balanced"),
  captureNoticeAcknowledged: z.literal(true),
});

export const createVisionPresetSchema = z.object({
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  source: visionSourceSchema.default("camera"),
  quality: visionQualitySchema.default("balanced"),
  settings: z.object({
    facingMode: z.enum(["user", "environment"]).default("user"),
    mirrorPreview: z.boolean().default(true),
    compositionGrid: z.enum(["none", "thirds", "center", "safe_area"]).default("thirds"),
  }).default({}),
});

export const updateVisionPresetSchema = createVisionPresetSchema.partial().extend({
  version: z.number().int().positive(),
});

export const visionObservationSchema = z.object({
  frameId: z.string().trim().min(1).max(160),
  kind: z.enum(["scene_snapshot", "composition", "operator_label"]),
  label: z.string().trim().min(1).max(80).nullable().optional(),
  summary: z.string().trim().max(1_000).default(""),
  confidence: z.number().min(0).max(1).default(1),
  source: z.enum(["browser_measurement", "operator", "vision_provider"]).default("browser_measurement"),
  operatorConfirmed: z.boolean().default(false),
  width: z.number().int().positive().max(7680),
  height: z.number().int().positive().max(4320),
  metrics: z.object({
    brightness: z.number().min(0).max(1).nullable().default(null),
    contrast: z.number().min(0).max(1).nullable().default(null),
    compositionScore: z.number().min(0).max(1).nullable().default(null),
  }).default({}),
});

export const visionSessionCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start"), captureNoticeAcknowledged: z.literal(true) }),
  z.object({ command: z.literal("stop"), reason: z.string().trim().max(200).default("operator_stop") }),
  z.object({ command: z.literal("activate_preset"), presetId: z.string().uuid(), version: z.number().int().positive() }),
  z.object({ command: z.literal("follow_start"), target: z.string().trim().min(1).max(80).default("operator") }),
  z.object({ command: z.literal("follow_stop") }),
  z.object({
    command: z.literal("watch_start"),
    target: z.string().trim().min(1).max(80),
    condition: visionWatchConditionSchema.default("moved"),
    durationMinutes: z.number().int().min(1).max(60).default(60),
  }),
  z.object({ command: z.literal("watch_stop"), watchId: z.string().uuid() }),
  z.object({
    command: z.literal("watch_trigger"),
    watchId: z.string().uuid(),
    frameId: z.string().trim().min(1).max(160),
    motionScore: z.number().min(0).max(1),
    source: z.literal("browser_measurement"),
  }),
  z.object({ command: z.literal("observe"), observation: visionObservationSchema }),
  z.object({ command: z.literal("archive") }),
]);

export const visionUmhCreateSessionSchema = createVisionSessionSchema.omit({ captureNoticeAcknowledged: true }).extend({
  captureNoticeAcknowledged: z.boolean().optional(),
});
export const visionUmhStopSessionSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.string().trim().max(200).default("umh_stop"),
});

export type VisionSource = z.infer<typeof visionSourceSchema>;
export type VisionQuality = z.infer<typeof visionQualitySchema>;
export type VisionSessionCommand = z.infer<typeof visionSessionCommandSchema>;

export function frameActivityScore(previous: Uint8ClampedArray, current: Uint8ClampedArray) {
  if (previous.length !== current.length || current.length === 0) return 0;
  let difference = 0;
  for (let index = 0; index < current.length; index += 4) {
    const priorLuminance = 0.2126 * previous[index] + 0.7152 * previous[index + 1] + 0.0722 * previous[index + 2];
    const currentLuminance = 0.2126 * current[index] + 0.7152 * current[index + 1] + 0.0722 * current[index + 2];
    difference += Math.abs(currentLuminance - priorLuminance) / 255;
  }
  return Math.max(0, Math.min(1, difference / (current.length / 4)));
}

export const visionPrivacyRules = [
  "Camera or screen capture starts only after an explicit operator action.",
  "A visible LIVE indicator remains present for the entire active session.",
  "The Vision pathway captures no audio.",
  "Raw frames stay in the browser unless the operator explicitly saves a snapshot to private Media Cloud storage.",
  "Scene metadata expires after five minutes without a fresh observation.",
  "Tracking, watch, and follow modes require explicit activation and can be stopped immediately.",
  "Watch mode expires within sixty minutes.",
  "No face identity, emotion, health, age, gender, ethnicity, or biometric claims are permitted.",
  "Visual answers must cite a frame and timestamp or say that no grounded observation exists.",
] as const;
