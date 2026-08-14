import { z } from "zod";

export const captureNodeKindSchema = z.enum([
  "android",
  "ios",
  "desktop",
  "remote_guest",
  "encoder",
]);

export const captureTransportSchema = z.enum(["srt", "whip", "rtmps"]);
export const captureCodecSchema = z.enum(["h264", "h265", "av1"]);

export const captureCapabilitiesSchema = z.object({
  transports: z.array(captureTransportSchema).min(1).max(3),
  videoCodecs: z.array(captureCodecSchema).min(1).max(3),
  maxWidth: z.number().int().min(640).max(7680),
  maxHeight: z.number().int().min(360).max(4320),
  maxFps: z.number().int().min(15).max(240),
  cameraCount: z.number().int().min(0).max(16).default(1),
  audioInputCount: z.number().int().min(0).max(32).default(1),
  hardwareEncoding: z.boolean().default(true),
  localRecording: z.boolean().default(true),
  backgroundCapture: z.boolean().default(false),
  screenCapture: z.boolean().default(false),
  adaptiveBitrate: z.boolean().default(true),
  connectionBonding: z.boolean().default(false),
  talkback: z.boolean().default(false),
  remoteControl: z.boolean().default(true),
  cameraControls: z.boolean().default(false),
  locationMetadata: z.boolean().default(false),
});

export const captureEncodingProfileSchema = z.object({
  transport: captureTransportSchema.default("srt"),
  codec: captureCodecSchema.default("h264"),
  width: z.number().int().min(640).max(3840).default(1920),
  height: z.number().int().min(360).max(2160).default(1080),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).default(30),
  minVideoBitrateKbps: z.number().int().min(250).max(12_000).default(800),
  targetVideoBitrateKbps: z.number().int().min(500).max(30_000).default(4_500),
  maxVideoBitrateKbps: z.number().int().min(500).max(50_000).default(8_000),
  audioBitrateKbps: z.number().int().min(48).max(320).default(128),
  keyframeIntervalSeconds: z.number().int().min(1).max(10).default(2),
  adaptiveBitrate: z.boolean().default(true),
  localRecording: z.boolean().default(true),
  disconnectSlate: z.boolean().default(true),
  preferredOrientation: z.enum(["landscape", "portrait", "auto"]).default("auto"),
}).superRefine((value, context) => {
  if (value.minVideoBitrateKbps > value.targetVideoBitrateKbps) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["minVideoBitrateKbps"], message: "Minimum bitrate cannot exceed target bitrate" });
  }
  if (value.targetVideoBitrateKbps > value.maxVideoBitrateKbps) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetVideoBitrateKbps"], message: "Target bitrate cannot exceed maximum bitrate" });
  }
});

export const defaultCaptureEncodingProfile = captureEncodingProfileSchema.parse({});

export const captureNodeClaimSchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(1).max(120),
  kind: captureNodeKindSchema,
  capabilities: captureCapabilitiesSchema,
});

export const captureNodeConfigurationSchema = z.object({
  profile: captureEncodingProfileSchema.default(defaultCaptureEncodingProfile),
  requestedState: z.enum(["ready", "live", "standby", "paused", "stopped"]).default("ready"),
  captureMode: z.enum(["camera", "screen", "audio_only"]).default("camera"),
  cameraFacing: z.enum(["front", "rear"]).default("rear"),
  cameraLens: z.enum(["auto", "wide", "ultrawide", "telephoto"]).default("auto"),
  zoom: z.number().min(1).max(20).default(1),
  exposureCompensation: z.number().min(-4).max(4).default(0),
  stabilizationEnabled: z.boolean().default(true),
  torchEnabled: z.boolean().default(false),
  microphoneMuted: z.boolean().default(false),
  localRecordingEnabled: z.boolean().default(true),
  recordingSegmentSeconds: z.number().int().min(30).max(1_800).default(300),
  locationSharing: z.enum(["off", "approximate", "exact"]).default("off"),
  burnInTimestamp: z.boolean().default(false),
  talkbackEnabled: z.boolean().default(false),
  tallyEnabled: z.boolean().default(true),
  remoteControlEnabled: z.boolean().default(true),
  telemetryIntervalSeconds: z.number().int().min(2).max(60).default(5),
}).default({});

export const captureNetworkLinkSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(["wifi", "cellular", "ethernet", "usb", "unknown"]),
  active: z.boolean(),
  uplinkKbps: z.number().int().min(0).max(1_000_000),
  rttMs: z.number().int().min(0).max(60_000),
  jitterMs: z.number().int().min(0).max(60_000),
  packetLossPct: z.number().min(0).max(100),
});

export const captureTelemetrySchema = z.object({
  sequence: z.number().int().positive(),
  capturedAt: z.string().datetime({ offset: true }),
  state: z.enum(["pairing", "ready", "connecting", "live", "standby", "paused", "degraded", "reconnecting", "offline", "stopped", "error"]),
  links: z.array(captureNetworkLinkSchema).max(8),
  encoder: z.object({
    videoBitrateKbps: z.number().int().min(0).max(100_000),
    audioBitrateKbps: z.number().int().min(0).max(2_000),
    fps: z.number().min(0).max(240),
    droppedFrames: z.number().int().min(0),
    encodedFrames: z.number().int().min(0),
    queueMs: z.number().int().min(0).max(60_000),
  }),
  device: z.object({
    batteryPct: z.number().min(0).max(100).nullable(),
    charging: z.boolean().nullable(),
    thermalState: z.enum(["nominal", "fair", "serious", "critical", "unknown"]),
    availableStorageMb: z.number().int().min(0).nullable(),
  }),
  recording: z.object({
    active: z.boolean(),
    pendingSegments: z.number().int().min(0).max(100_000),
    durationMs: z.number().int().min(0),
  }),
});

export type CaptureCapabilities = z.infer<typeof captureCapabilitiesSchema>;
export type CaptureEncodingProfile = z.infer<typeof captureEncodingProfileSchema>;
export type CaptureNodeConfiguration = z.infer<typeof captureNodeConfigurationSchema>;
export type CaptureTelemetry = z.infer<typeof captureTelemetrySchema>;
export type CaptureContinuityState = CaptureTelemetry["state"];

export type CaptureEncodingDirective = {
  videoBitrateKbps: number;
  fps: 24 | 25 | 30 | 50 | 60;
  width: number;
  height: number;
  reason: "stable" | "bandwidth" | "packet_loss" | "latency" | "thermal" | "battery" | "recovery";
  disconnectSlate: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function effectiveCaptureUplinkKbps(telemetry: CaptureTelemetry, bonding: boolean) {
  const active = telemetry.links.filter((link) => link.active && link.uplinkKbps > 0);
  if (!active.length) return 0;
  if (bonding) return Math.round(active.reduce((sum, link) => sum + link.uplinkKbps, 0) * 0.72);
  return Math.round(Math.max(...active.map((link) => link.uplinkKbps)) * 0.72);
}

export function recommendCaptureEncoding(
  telemetryInput: CaptureTelemetry,
  configurationInput: CaptureNodeConfiguration,
  capabilitiesInput: CaptureCapabilities,
  previous?: CaptureEncodingDirective,
): CaptureEncodingDirective {
  const telemetry = captureTelemetrySchema.parse(telemetryInput);
  const configuration = captureNodeConfigurationSchema.parse(configurationInput);
  const capabilities = captureCapabilitiesSchema.parse(capabilitiesInput);
  const profile = configuration.profile;
  const uplink = effectiveCaptureUplinkKbps(telemetry, capabilities.connectionBonding);
  const activeLinks = telemetry.links.filter((link) => link.active);
  const worstLoss = activeLinks.length ? Math.max(...activeLinks.map((link) => link.packetLossPct)) : 100;
  const worstRtt = activeLinks.length ? Math.max(...activeLinks.map((link) => link.rttMs)) : 60_000;
  let reason: CaptureEncodingDirective["reason"] = "stable";
  let ceiling = Math.min(profile.maxVideoBitrateKbps, Math.floor(uplink * 0.72));

  if (worstLoss >= 8) {
    ceiling *= 0.45;
    reason = "packet_loss";
  } else if (worstLoss >= 3) {
    ceiling *= 0.7;
    reason = "packet_loss";
  } else if (worstRtt >= 700) {
    ceiling *= 0.65;
    reason = "latency";
  } else if (uplink < profile.targetVideoBitrateKbps * 1.35) {
    reason = "bandwidth";
  }

  if (telemetry.device.thermalState === "critical" || telemetry.device.thermalState === "serious") {
    ceiling = Math.min(ceiling, profile.targetVideoBitrateKbps * 0.55);
    reason = "thermal";
  } else if (telemetry.device.batteryPct !== null && telemetry.device.batteryPct <= 10 && telemetry.device.charging === false) {
    ceiling = Math.min(ceiling, profile.targetVideoBitrateKbps * 0.65);
    reason = "battery";
  }

  if (["reconnecting", "degraded"].includes(telemetry.state)) {
    ceiling = Math.min(ceiling, profile.targetVideoBitrateKbps * 0.6);
    if (reason === "stable") reason = "recovery";
  }

  let bitrate = clamp(ceiling || profile.minVideoBitrateKbps, profile.minVideoBitrateKbps, profile.maxVideoBitrateKbps);
  // A small hysteresis prevents device encoders from oscillating on ordinary
  // cellular jitter. Emergency reductions are always applied immediately.
  if (previous && reason === "stable" && Math.abs(previous.videoBitrateKbps - bitrate) < Math.max(250, previous.videoBitrateKbps * 0.12)) {
    bitrate = previous.videoBitrateKbps;
  }

  const ratio = bitrate / profile.targetVideoBitrateKbps;
  const fps = Math.min(capabilities.maxFps, ratio < 0.45 ? 24 : ratio < 0.75 ? Math.min(30, profile.fps) : profile.fps) as CaptureEncodingDirective["fps"];
  const requestedWidth = Math.min(profile.width, capabilities.maxWidth);
  const requestedHeight = Math.min(profile.height, capabilities.maxHeight);
  const scale = ratio < 0.35 ? 0.5 : ratio < 0.7 ? 0.75 : 1;
  const width = Math.max(640, Math.round((requestedWidth * scale) / 2) * 2);
  const height = Math.max(360, Math.round((requestedHeight * scale) / 2) * 2);

  return { videoBitrateKbps: bitrate, fps, width, height, reason, disconnectSlate: profile.disconnectSlate };
}

export function captureContinuityTransition(
  current: CaptureContinuityState,
  event: "pair" | "ready" | "connect" | "media" | "standby" | "pause" | "resume" | "degrade" | "disconnect" | "recover" | "stop" | "fail",
): CaptureContinuityState {
  if (event === "fail") return "error";
  if (event === "stop") return "stopped";
  const allowed: Record<CaptureContinuityState, Partial<Record<typeof event, CaptureContinuityState>>> = {
    pairing: { pair: "ready" },
    ready: { connect: "connecting" },
    connecting: { media: "live", disconnect: "reconnecting" },
    live: { standby: "standby", pause: "paused", degrade: "degraded", disconnect: "reconnecting" },
    standby: { media: "live", pause: "paused", disconnect: "reconnecting" },
    paused: { resume: "live", standby: "standby", disconnect: "reconnecting" },
    degraded: { recover: "live", disconnect: "reconnecting" },
    reconnecting: { media: "live", disconnect: "offline" },
    offline: { recover: "connecting" },
    stopped: { ready: "ready" },
    error: { ready: "ready" },
  };
  return allowed[current][event] ?? current;
}

export function captureReadiness(capabilitiesInput: CaptureCapabilities) {
  const capabilities = captureCapabilitiesSchema.parse(capabilitiesInput);
  const blockers: string[] = [];
  if (!capabilities.videoCodecs.includes("h264")) blockers.push("h264_required_for_universal_fallback");
  if (!capabilities.transports.some((transport) => transport === "srt" || transport === "whip")) blockers.push("resilient_transport_required");
  if (!capabilities.hardwareEncoding) blockers.push("hardware_encoder_required");
  if (!capabilities.localRecording) blockers.push("local_recovery_recording_required");
  if (!capabilities.adaptiveBitrate) blockers.push("adaptive_bitrate_required");
  return { ready: blockers.length === 0, blockers };
}
