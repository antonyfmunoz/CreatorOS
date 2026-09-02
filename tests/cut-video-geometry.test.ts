import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { cutFitVideoFilters, cutSourceVideoFilters, cutSourceRenditionSize } from "../server/cut-video-geometry";

function probe(filters: string[]) {
  const encoded = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "color=c=red:s=640x360:r=30:d=0.1", "-vf", filters.join(","), "-frames:v", "1", "-threads", "1", "-c:v", "rawvideo", "-f", "nut", "pipe:1"], { timeout: 10000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,sample_aspect_ratio,display_aspect_ratio", "-of", "json", "pipe:0"], { input: encoded, timeout: 10000, windowsHide: true, encoding: "utf8" })).streams[0];
}
describe("square-pixel CutStudio delivery", () => {
  it("keeps a source-derived multitrack canvas for portrait, anamorphic and rotated media", () => {
    expect(cutSourceRenditionSize({ width: 180, height: 320 }, 720)).toEqual([404, 720]);
    expect(cutSourceRenditionSize({ width: 640, height: 360, sampleAspectRatio: "4:3" }, 360)).toEqual([852, 360]);
    expect(cutSourceRenditionSize({ width: 320, height: 180, rotation: -90 }, 720)).toEqual([404, 720]);
    expect(cutSourceRenditionSize({ width: 320, height: 180, rotation: 270 }, 720)).toEqual([404, 720]);
    expect(cutSourceRenditionSize({ width: 8000, height: 1000 }, 2160)).toEqual([3840, 480]);
    for (const source of [{}, { width: 0, height: 100 }, { width: 100, height: NaN }, { width: 100, height: 100, sampleAspectRatio: "bad" }, { width: 100, height: 100, rotation: Infinity }]) expect(() => cutSourceRenditionSize(source, 720)).toThrow();
  });
  it("rejects invalid dimensions before generating filter expressions", () => {
    for (const size of [0, -2, 3, 9000, NaN, Infinity]) expect(() => cutFitVideoFilters(size, 720)).toThrow();
  });
  it("normalizes ordinary and anamorphic footage to the requested portrait canvas", () => {
    for (const sar of ["1", "4/3", "8/9"]) expect(probe([`setsar=${sar}`, ...cutFitVideoFilters(406, 720)])).toMatchObject({ width: 406, height: 720, sample_aspect_ratio: "1:1", display_aspect_ratio: "203:360" });
  }, 30000);
  it("preserves displayed source geometry instead of flattening anamorphic pixels", () => {
    expect(probe(["setsar=4/3", ...cutSourceVideoFilters(360)])).toMatchObject({ width: 852, height: 360, sample_aspect_ratio: "1:1" });
    expect(probe(["setsar=1", ...cutSourceVideoFilters(360)])).toMatchObject({ width: 640, height: 360, sample_aspect_ratio: "1:1" });
  }, 20000);
});
