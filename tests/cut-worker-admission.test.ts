import { describe, expect, it } from "vitest";
import { reserveWorkerSlot as reserveCutWorkerSlot } from "../server/worker-admission";

describe("native worker slot reservation", () => {
  it("prevents overlapping dispatch selections from overcommitting a worker", async () => {
    const running = new Set<string>();
    const admitted: string[] = [];
    let releaseSelection!: () => void, releaseWork!: () => void, peak = 0;
    const selected = new Promise<void>((resolve) => { releaseSelection = resolve; });
    const work = new Promise<void>((resolve) => { releaseWork = resolve; });
    // Every selector read two available slots before its database await. Later
    // selectors can see different queued rows after earlier claims commit.
    const dispatches = [["a", "b"], ["c", "d"], ["a", "e"]].map(async (rows) => {
      await selected;
      return Promise.all(rows.map(async (id) => {
        if (!reserveCutWorkerSlot(running, id, 2, false)) return false;
        admitted.push(id); peak = Math.max(peak, running.size);
        try { await work; return true; } finally { running.delete(id); }
      }));
    });
    releaseSelection();
    try {
      await Promise.resolve();
      expect(admitted).toEqual(["a", "b"]);
      expect(running.size).toBe(2);
      expect(peak).toBe(2);
    } finally { releaseWork(); }
    expect((await Promise.all(dispatches)).flat().filter(Boolean)).toHaveLength(2);
    expect(running.size).toBe(0);
    // Rejected claims remain queued; a subsequent dispatch can admit them.
    expect(reserveCutWorkerSlot(running, "c", 2, false)).toBe(true);
    expect(reserveCutWorkerSlot(running, "d", 2, false)).toBe(true);
    expect(reserveCutWorkerSlot(running, "e", 2, false)).toBe(false);
  });

  it("preserves duplicate prevention and refuses new reservations while draining", () => {
    const running = new Set(["a"]);
    expect(reserveCutWorkerSlot(running, "a", 2, false)).toBe(false);
    expect(reserveCutWorkerSlot(running, "b", 2, true)).toBe(false);
    expect([...running]).toEqual(["a"]);
    expect(reserveCutWorkerSlot(running, "b", 2, false)).toBe(true);
  });

  it("rejects invalid capacity without modifying active reservations", () => {
    const running = new Set(["a"]);
    for (const capacity of [0, -1, 1.5, 65, NaN, Infinity]) expect(() => reserveCutWorkerSlot(running, "b", capacity, false)).toThrow(/capacity/);
    expect([...running]).toEqual(["a"]);
  });
});
