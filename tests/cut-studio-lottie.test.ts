import { describe, expect, it } from "vitest";
import { validateCutStudioLottie } from "../shared/cut-studio-lottie";

function vectorAnimation(overrides: Record<string, unknown> = {}) {
  return {
    v: "5.13.0",
    fr: 30,
    ip: 0,
    op: 60,
    w: 640,
    h: 360,
    layers: [{ ty: 4, nm: "Safe vector", ip: 0, op: 60, st: 0, ks: {} }],
    assets: [],
    ...overrides,
  };
}

describe("CutStudio private Lottie policy", () => {
  it("accepts bounded, self-contained vector animation documents", () => {
    const validated = validateCutStudioLottie(vectorAnimation());
    expect(validated).toMatchObject({ width: 640, height: 360, frameRate: 30, inPoint: 0, outPoint: 60, durationSeconds: 2 });
  });

  it("rejects external, embedded, and image footage resources", () => {
    expect(() => validateCutStudioLottie(vectorAnimation({ assets: [{ id: "image_0", p: "https://example.com/tracker.png", u: "" }] }))).toThrow(/image, footage and embedded assets|embedded or external assets|external resources/i);
    expect(() => validateCutStudioLottie(vectorAnimation({ assets: [{ id: "image_0", p: "data:image\/png;base64,AAAA", e: 1 }] }))).toThrow(/image, footage and embedded assets|embedded or external assets|external resources/i);
  });

  it("rejects expression execution and unsupported layer runtimes", () => {
    expect(() => validateCutStudioLottie(vectorAnimation({ layers: [{ ty: 4, x: "time * 10" }] }))).toThrow(/expressions are not allowed/i);
    expect(() => validateCutStudioLottie(vectorAnimation({ layers: [{ ty: 2, refId: "image_0" }] }))).toThrow(/unsupported layer type/i);
    expect(() => validateCutStudioLottie(vectorAnimation({ layers: [{ ty: 13 }] }))).toThrow(/unsupported layer type/i);
    expect(() => validateCutStudioLottie(JSON.parse('{"v":"5.13.0","fr":30,"ip":0,"op":60,"w":100,"h":100,"layers":[{"ty":4,"__proto__":{"polluted":true}}]}'))).toThrow(/unsafe object properties/i);
  });

  it("enforces deterministic duration and document bounds", () => {
    expect(() => validateCutStudioLottie(vectorAnimation({ op: 0 }))).toThrow(/out point must follow/i);
    expect(() => validateCutStudioLottie(vectorAnimation({ op: 108_001 }))).toThrow(/one hour/i);
    expect(() => validateCutStudioLottie(vectorAnimation({ w: 8_000 }))).toThrow();
  });
});
