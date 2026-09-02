import { describe, expect, it } from "vitest";
import { cutStillAdmission, cutStillArguments, cutStillRequestSchema, parseCutStillProbe } from "../server/cut-still";

const probe = { streams: [{ width: 720, height: 1280, avg_frame_rate: "30/1", r_frame_rate: "30/1", nb_frames: "90" }] };
describe("private render frame export", () => {
  it("accepts bounded integral frames and explicit safe image formats", () => {
    expect(cutStillRequestSchema.parse({})).toEqual({ frame: 0, format: "png" });
    expect(cutStillRequestSchema.parse({ frame: "30", format: "webp" })).toEqual({ frame: 30, format: "webp" });
    for (const frame of ["-1", "1.5", "Infinity", "10000000", "1;echo", ["1", "2"]]) expect(cutStillRequestSchema.safeParse({ frame }).success).toBe(false);
    expect(cutStillRequestSchema.safeParse({ format: "svg" }).success).toBe(false);
    expect(cutStillRequestSchema.safeParse({ url: "https://example.com" }).success).toBe(false);
  });
  it("inspects a native constant-rate render without guessing timing", () => {
    expect(parseCutStillProbe(probe)).toEqual({ width: 720, height: 1280, fps: 30, frameCount: 90 });
    for (const change of [{ avg_frame_rate: "0/0" }, { nb_frames: "N/A" }, { r_frame_rate: "24/1" }, { width: 100000 }, { nb_frames: "999999999" }]) expect(() => parseCutStillProbe({ streams: [{ ...probe.streams[0], ...change }] })).toThrow();
    expect(() => parseCutStillProbe({ streams: [] })).toThrow();
  });
  it("seeks the exact frame time and emits one image with bounded decoder threads", () => {
    const args = cutStillArguments("private-input.mp4", "still.png", 31, 30);
    expect(args).toContain("1.033333333");
    expect(args.slice(args.indexOf("-frames:v"), args.indexOf("-frames:v") + 2)).toEqual(["-frames:v", "1"]);
    expect(args).toContain("-nostdin");
    expect(() => cutStillArguments("in", "out", .5, 30)).toThrow();
  });
  it("caps concurrent decoders and releases each slot only once", () => {
    const admit = cutStillAdmission();
    const a = admit()!; const b = admit()!;
    expect(admit()).toBeNull();
    a(); a();
    expect(admit()).not.toBeNull();
    expect(admit()).toBeNull();
    b(); expect(admit()).not.toBeNull();
  });
});
