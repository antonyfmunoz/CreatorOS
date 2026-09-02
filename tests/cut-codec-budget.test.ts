import { expect, it } from "vitest";
import { cutCodecThreadArgs } from "../server/cut-codec-budget";

it("bounds each video codec without changing quality, size, or frame settings", () => {
  expect(cutCodecThreadArgs({}, 1)).toEqual(["-threads:v", "1"]);
  for (const cores of [2, 8, 64, 128]) expect(cutCodecThreadArgs({}, cores)).toEqual(["-threads:v", "2"]);
});

it("accepts explicit bounded tuning and rejects automatic or malformed codec settings", () => {
  for (const count of [1, 2, 8, 32]) expect(cutCodecThreadArgs({ CUT_CODEC_THREADS: String(count) })).toEqual(["-threads:v", String(count)]);
  for (const value of ["", "0", "33", "-1", "1.5", "auto", " 2", "2 ", "2;-y", "NaN", "01"]) expect(() => cutCodecThreadArgs({ CUT_CODEC_THREADS: value })).toThrow(/between 1 and 32/);
  for (const cores of [0, -1, 1.5, NaN, Infinity]) expect(() => cutCodecThreadArgs({}, cores)).toThrow(/availability/);
});
