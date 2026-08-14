import { describe, expect, it } from "vitest";
import { captureNodeKind } from "../client/src/lib/field-capture";
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
});
