import { describe, expect, it } from "vitest";
import { createVisionSessionSchema, frameActivityScore, visionPrivacyRules, visionSessionCommandSchema, visionUmhCreateSessionSchema } from "../shared/vision";
import { getCreativesOsCapabilityManifest, supportedUmhCommandTypes } from "../shared/umh-contract";

describe("Vision projection contract", () => {
  it("requires an explicit capture notice for local session creation", () => {
    expect(createVisionSessionSchema.safeParse({ title: "Desk", source: "camera", quality: "balanced", captureNoticeAcknowledged: false }).success).toBe(false);
    expect(createVisionSessionSchema.safeParse({ title: "Desk", source: "camera", quality: "balanced", captureNoticeAcknowledged: true }).success).toBe(true);
  });

  it("lets UMH prepare but not silently activate a local capture session", () => {
    expect(visionUmhCreateSessionSchema.parse({ title: "Prepared", source: "screen", quality: "analysis" })).toEqual(expect.objectContaining({ title: "Prepared" }));
    expect(supportedUmhCommandTypes).toContain("creativesos.vision.session.create.v1");
    expect(supportedUmhCommandTypes).toContain("creativesos.vision.session.stop.v1");
    expect(supportedUmhCommandTypes).not.toContain("creativesos.vision.session.start.v1");
  });

  it("bounds watch duration and requires operator-confirmed labels", () => {
    expect(visionSessionCommandSchema.safeParse({ command: "watch_start", target: "notebook", durationMinutes: 61 }).success).toBe(false);
    expect(visionSessionCommandSchema.safeParse({ command: "watch_trigger", watchId: crypto.randomUUID(), frameId: "activity_1", motionScore: 0.42, source: "browser_measurement" }).success).toBe(true);
    expect(visionSessionCommandSchema.safeParse({ command: "watch_trigger", watchId: crypto.randomUUID(), frameId: "activity_1", motionScore: 1.1, source: "browser_measurement" }).success).toBe(false);
    const label = visionSessionCommandSchema.parse({ command: "observe", observation: { frameId: "frame_1", kind: "operator_label", label: "notebook", summary: "notebook", confidence: 1, source: "operator", operatorConfirmed: true, width: 100, height: 100, metrics: {} } });
    expect(label.command).toBe("observe");
  });

  it("publishes native capture and optional provider analysis as separate capabilities", () => {
    const capabilities = getCreativesOsCapabilityManifest().capabilities;
    expect(capabilities.find((capability) => capability.id === "vision.capture")).toEqual(expect.objectContaining({ kind: "native", provider: "browser_media_devices" }));
    expect(capabilities.find((capability) => capability.id === "vision.watch")).toEqual(expect.objectContaining({ kind: "native", provider: "browser_frame_delta", health: "healthy" }));
    expect(capabilities.find((capability) => capability.id === "vision.analyze")).toEqual(expect.objectContaining({ kind: "provider", health: "provider_not_configured" }));
    expect(visionPrivacyRules.join(" ")).toMatch(/no face identity/i);
  });

  it("measures local scene activity without retaining an image", () => {
    const still = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const changed = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(frameActivityScore(still, still)).toBe(0);
    expect(frameActivityScore(still, changed)).toBeCloseTo(1, 10);
    expect(frameActivityScore(still, new Uint8ClampedArray([0, 0, 0, 255]))).toBe(0);
  });
});
