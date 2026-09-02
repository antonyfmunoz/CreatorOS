import { describe, expect, it } from "vitest";
import { createCutProcessProgressParser, cutProcessProgressDisplay, type CutProcessProgress } from "../server/cut-process-progress";

describe("bounded native render progress", () => {
  it("joins chunk boundaries and emits complete allowlisted records", () => {
    const records: CutProcessProgress[] = []; const parse = createCutProcessProgressParser((record) => records.push(record));
    parse("frame=12\nout_time_u"); parse("s=500000\nfps=24.00\nspeed=  1.2x\nprogress=cont");
    expect(records).toEqual([]); parse("inue\nframe=48\nout_time_us=2000000\nprogress=end\n");
    expect(records).toEqual([{ frame: 12, seconds: .5, fps: 24, speed: 1.2, complete: false }, { frame: 48, seconds: 2, complete: true }]);
  });
  it("rejects malformed values, private text, negatives, infinity and excessive bounds", () => {
    const records: CutProcessProgress[] = []; const parse = createCutProcessProgressParser((record) => records.push(record));
    parse("source=https://private.invalid/signed-secret\nframe=-1\nfps=Infinity\nout_time_us=999999999999999999\nspeed=NaN\nprogress=end\n");
    expect(records).toEqual([]);
    parse("frame=1\nout_time_ms=9000\nfps=hello\nspeed=2x\nprogress=continue\n");
    expect(records).toEqual([{ frame: 1, speed: 2, complete: false }]);
    expect(JSON.stringify(records)).not.toMatch(/private|signed|out_time_ms/);
  });
  it("recovers from an oversized unterminated line with bounded parser state", () => {
    const records: CutProcessProgress[] = []; const parse = createCutProcessProgressParser((record) => records.push(record));
    for (let count = 0; count < 100; count++) parse("x".repeat(20_000));
    parse("\nframe=30\nout_time_us=1000000\nprogress=end\n");
    expect(records).toEqual([{ frame: 30, seconds: 1, complete: true }]);
  });
  it("never reports artifact completion from an encoder progress event", () => {
    expect(cutProcessProgressDisplay({ frame: 300, seconds: 10, speed: 2, complete: true }, 2)).toEqual({ progress: .9, detail: "Rendering edit · frame 300 · 10.00s · 2.00x" });
    expect(cutProcessProgressDisplay({ complete: false }, NaN)).toEqual({ progress: .35, detail: "Rendering edit" });
  });
});
