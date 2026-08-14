import { describe, expect, it } from "vitest";
import { captureNodeKind, measureFieldSenderTransport } from "../client/src/lib/field-capture";
import { captureCapabilitiesSchema } from "../shared/broadcast-field";

describe("Broadcast Field browser client", () => {
  it("labels mobile and desktop device kinds consistently", () => {
    expect(captureNodeKind("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36")).toBe("android");
    expect(captureNodeKind("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(captureNodeKind("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });

  it("accepts WebRTC and browser-native codecs in the shared field protocol", () => {
    expect(captureCapabilitiesSchema.parse({
      transports: ["webrtc"], videoCodecs: ["vp8", "vp9"], maxWidth: 1920, maxHeight: 1080, maxFps: 30,
      cameraCount: 1, audioInputCount: 1, hardwareEncoding: false, localRecording: true, backgroundCapture: false,
      screenCapture: true, adaptiveBitrate: true, connectionBonding: false, talkback: false, remoteControl: true,
      cameraControls: true, locationMetadata: false,
    })).toMatchObject({ transports: ["webrtc"], videoCodecs: ["vp8", "vp9"] });
  });

  it("derives truthful outbound bitrate, loss, latency and encoder activity from sender deltas", () => {
    const previous = { sampledAtMs: 1_000, stats: [
      { id: "video", kind: "video" as const, timestamp: 1_000, bytesSent: 1_000_000, packetsSent: 1_000, packetsLost: 10, roundTripTime: .04, jitter: .005, framesPerSecond: 30, framesSent: 300 },
      { id: "audio", kind: "audio" as const, timestamp: 1_000, bytesSent: 100_000, packetsSent: 200, packetsLost: 2, roundTripTime: .03, jitter: .003 },
    ] };
    const current = { sampledAtMs: 3_000, stats: [
      { id: "video", kind: "video" as const, timestamp: 3_000, bytesSent: 2_000_000, packetsSent: 1_900, packetsLost: 14, roundTripTime: .055, jitter: .007, framesPerSecond: 29.7, framesSent: 360 },
      { id: "audio", kind: "audio" as const, timestamp: 3_000, bytesSent: 132_000, packetsSent: 260, packetsLost: 3, roundTripTime: .045, jitter: .004 },
    ] };

    expect(measureFieldSenderTransport(current, previous)).toEqual({
      uplinkKbps: 4_128,
      rttMs: 55,
      jitterMs: 7,
      packetLossPct: 0.52,
      videoBitrateKbps: 4_000,
      audioBitrateKbps: 128,
      fps: 29.7,
      encodedFrames: 360,
    });
  });

  it("reports zero rates until a prior sender sample exists", () => {
    expect(measureFieldSenderTransport({ sampledAtMs: 1_000, stats: [{ id: "video", kind: "video", timestamp: 1_000, bytesSent: 500_000, framesSent: 30 }] }, null)).toMatchObject({ uplinkKbps: 0, videoBitrateKbps: 0, encodedFrames: 30 });
  });
});
