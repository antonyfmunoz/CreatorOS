import { describe, expect, it } from "vitest";
import { CUT_STUDIO_RIVE_MAX_BYTES, validateCutStudioRiveBytes } from "../shared/cut-studio-rive";

describe("CutStudio private Rive policy", () => {
  it("accepts a bounded RIVE container header", () => {
    expect(validateCutStudioRiveBytes(Uint8Array.from([0x52, 0x49, 0x56, 0x45, 7, 0, 1, 2]))).toEqual({ byteLength: 8, formatVersion: 7 });
  });

  it("rejects malformed, truncated, unsupported and oversized containers", () => {
    expect(() => validateCutStudioRiveBytes(Uint8Array.from([0x52, 0x49]))).toThrow(/truncated/i);
    expect(() => validateCutStudioRiveBytes(Uint8Array.from([0x50, 0x4e, 0x47, 0x00, 7, 0, 1, 2]))).toThrow(/header/i);
    expect(() => validateCutStudioRiveBytes(Uint8Array.from([0x52, 0x49, 0x56, 0x45, 0, 0, 1, 2]))).toThrow(/version/i);
    const oversized = new Uint8Array(CUT_STUDIO_RIVE_MAX_BYTES + 1);
    oversized.set([0x52, 0x49, 0x56, 0x45, 7]);
    expect(() => validateCutStudioRiveBytes(oversized)).toThrow(/safe limit/i);
  });

  it("honors ArrayBufferView offsets rather than examining adjacent bytes", () => {
    const backing = Uint8Array.from([0, 0, 0x52, 0x49, 0x56, 0x45, 7, 0, 1, 2, 0]);
    expect(validateCutStudioRiveBytes(backing.subarray(2, 10))).toMatchObject({ byteLength: 8, formatVersion: 7 });
  });
});
