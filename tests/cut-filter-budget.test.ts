import { expect, it } from "vitest";
import { cutFilterThreadArgs } from "../server/cut-filter-budget";

it("bounds the default complex graph pool without adding codec/input options", () => {
  expect(cutFilterThreadArgs({}, 1)).toEqual(["-filter_complex_threads", "1"]);
  for (const cores of [2, 8, 64, 128]) expect(cutFilterThreadArgs({}, cores)).toEqual(["-filter_complex_threads", "2"]);
});
it("allows explicit bounded operator tuning and rejects malformed settings", () => {
  for (const count of [1, 2, 8, 32]) expect(cutFilterThreadArgs({ CUT_FILTER_THREADS: String(count) })).toEqual(["-filter_complex_threads", String(count)]);
  for (const value of ["", "0", "33", "-1", "1.5", "auto", " 2", "2 ", "2;-y", "NaN", "01"]) {
    expect(() => cutFilterThreadArgs({ CUT_FILTER_THREADS: value })).toThrow(/between 1 and 32/);
  }
  for (const cores of [0, -1, 1.5, NaN, Infinity]) expect(() => cutFilterThreadArgs({}, cores)).toThrow(/availability/);
});
