import { describe, expect, it } from "vitest";
import {
  captureContinuityTransition,
  captureNodeConfigurationSchema,
  captureReadiness,
  captureTelemetrySchema,
  effectiveCaptureUplinkKbps,
  recommendCaptureEncoding,
  type CaptureCapabilities,
} from "../shared/broadcast-field";

const capabilities: CaptureCapabilities = {
  transports: ["srt", "whip", "rtmps"],
  videoCodecs: ["h264", "h265"],
  maxWidth: 3840,
  maxHeight: 2160,
  maxFps: 60,
  cameraCount: 3,
  audioInputCount: 3,
  hardwareEncoding: true,
  localRecording: true,
  backgroundCapture: true,
  screenCapture: true,
  adaptiveBitrate: true,
  connectionBonding: true,
  talkback: true,
  remoteControl: true,
  cameraControls: true,
  locationMetadata: true,
};

function telemetry(overrides: Record<string, unknown> = {}) {
  return captureTelemetrySchema.parse({
    sequence: 1,
    capturedAt: "2026-08-14T20:00:00.000Z",
    state: "live",
    links: [{ id: "wifi", type: "wifi", active: true, uplinkKbps: 12_000, rttMs: 50, jitterMs: 7, packetLossPct: 0.2 }],
    encoder: { videoBitrateKbps: 4_500, audioBitrateKbps: 128, fps: 30, droppedFrames: 0, encodedFrames: 1_000, queueMs: 20 },
    device: { batteryPct: 80, charging: false, thermalState: "nominal", availableStorageMb: 20_000 },
    recording: { active: true, pendingSegments: 0, durationMs: 30_000 },
    ...overrides,
  });
}

describe("Broadcast Field capture control plane", () => {
  it("qualifies resilient native capture capabilities", () => {
    expect(captureReadiness(capabilities)).toEqual({ ready: true, blockers: [] });
    expect(captureReadiness({ ...capabilities, transports: ["rtmps"], hardwareEncoding: false, localRecording: false, adaptiveBitrate: false })).toEqual({
      ready: false,
      blockers: [
        "resilient_transport_required",
        "hardware_encoder_required",
        "local_recovery_recording_required",
        "adaptive_bitrate_required",
      ],
    });
  });

  it("accepts truthful browser field-camera capabilities without claiming native SRT or H.264", () => {
    expect(captureReadiness({
      ...capabilities,
      transports: ["webrtc"],
      videoCodecs: ["vp8", "vp9"],
      hardwareEncoding: false,
      backgroundCapture: false,
      connectionBonding: false,
    })).toEqual({ ready: false, blockers: ["h264_required_for_universal_fallback", "hardware_encoder_required"] });
  });

  it("aggregates bonded uplinks conservatively", () => {
    const value = telemetry({ links: [
      { id: "wifi", type: "wifi", active: true, uplinkKbps: 8_000, rttMs: 40, jitterMs: 4, packetLossPct: 0.1 },
      { id: "5g", type: "cellular", active: true, uplinkKbps: 5_000, rttMs: 90, jitterMs: 13, packetLossPct: 0.6 },
    ] });
    expect(effectiveCaptureUplinkKbps(value, true)).toBe(9_360);
    expect(effectiveCaptureUplinkKbps(value, false)).toBe(5_760);
  });

  it("reduces bitrate, resolution, and frame rate under field failure pressure", () => {
    const configuration = captureNodeConfigurationSchema.parse({});
    const healthy = recommendCaptureEncoding(telemetry(), configuration, capabilities);
    expect(healthy).toMatchObject({ videoBitrateKbps: 6_220, width: 1920, height: 1080, fps: 30, reason: "stable" });

    const degraded = recommendCaptureEncoding(telemetry({
      state: "degraded",
      links: [{ id: "5g", type: "cellular", active: true, uplinkKbps: 2_200, rttMs: 880, jitterMs: 200, packetLossPct: 9 }],
      device: { batteryPct: 7, charging: false, thermalState: "serious", availableStorageMb: 400 },
    }), configuration, capabilities, healthy);
    expect(degraded.reason).toBe("thermal");
    expect(degraded.videoBitrateKbps).toBe(800);
    expect(degraded).toMatchObject({ width: 960, height: 540, fps: 24, disconnectSlate: true });
  });

  it("uses hysteresis on ordinary uplink movement", () => {
    const configuration = captureNodeConfigurationSchema.parse({});
    const previous = { videoBitrateKbps: 4_500, width: 1920, height: 1080, fps: 30 as const, reason: "stable" as const, disconnectSlate: true };
    const directive = recommendCaptureEncoding(telemetry({ links: [{ id: "wifi", type: "wifi", active: true, uplinkKbps: 8_700, rttMs: 40, jitterMs: 4, packetLossPct: 0.1 }] }), configuration, capabilities, previous);
    expect(directive.videoBitrateKbps).toBe(4_500);
  });

  it("materializes a complete privacy-safe director command contract", () => {
    const configuration = captureNodeConfigurationSchema.parse({
      requestedState: "standby",
      cameraFacing: "front",
      cameraLens: "wide",
      zoom: 2.5,
      torchEnabled: true,
      microphoneMuted: true,
      recordingSegmentSeconds: 120,
      locationSharing: "approximate",
    });
    expect(configuration).toMatchObject({
      requestedState: "standby",
      captureMode: "camera",
      cameraFacing: "front",
      cameraLens: "wide",
      zoom: 2.5,
      torchEnabled: true,
      microphoneMuted: true,
      localRecordingEnabled: true,
      recordingSegmentSeconds: 120,
      locationSharing: "approximate",
      burnInTimestamp: false,
      tallyEnabled: true,
      telemetryIntervalSeconds: 5,
    });
    expect(() => captureNodeConfigurationSchema.parse({ locationSharing: "always" })).toThrow();
    expect(() => captureNodeConfigurationSchema.parse({ recordingSegmentSeconds: 10 })).toThrow();
  });

  it("enforces explicit continuity transitions without reviving stopped capture accidentally", () => {
    expect(captureContinuityTransition("pairing", "pair")).toBe("ready");
    expect(captureContinuityTransition("ready", "connect")).toBe("connecting");
    expect(captureContinuityTransition("connecting", "media")).toBe("live");
    expect(captureContinuityTransition("live", "standby")).toBe("standby");
    expect(captureContinuityTransition("standby", "media")).toBe("live");
    expect(captureContinuityTransition("live", "pause")).toBe("paused");
    expect(captureContinuityTransition("paused", "resume")).toBe("live");
    expect(captureContinuityTransition("live", "disconnect")).toBe("reconnecting");
    expect(captureContinuityTransition("reconnecting", "disconnect")).toBe("offline");
    expect(captureContinuityTransition("offline", "recover")).toBe("connecting");
    expect(captureContinuityTransition("stopped", "media")).toBe("stopped");
  });
});
