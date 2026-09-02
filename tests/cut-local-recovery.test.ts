import { describe, expect, it } from "vitest";
import { CUT_RECOVERY_TTL_MS, disableCutRecovery, readCutRecoveryCopies, recoveryPreferenceKey, removeCutRecoveryCopy, writeCutRecoveryCopy, type CutRecoveryCopy, type RecoveryStorage } from "../client/src/lib/cut-local-recovery";

class MemoryStorage implements RecoveryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const copy = (extra: Partial<CutRecoveryCopy> = {}): CutRecoveryCopy => ({ version: 1, userId: 1, businessId: id(1), projectId: id(2), writerId: id(3), baseRevision: 1, updatedAt: Date.now(), edl: { version: 1, clips: [{ start: 0, end: 1 }] }, ...extra });
const enabled = () => { const storage = new MemoryStorage(); storage.setItem(recoveryPreferenceKey(1), "true"); return storage; };

describe("opt-in, account/project-scoped timeline recovery records", () => {
  it("does not persist without explicit account opt-in", () => {
    const storage = new MemoryStorage();
    expect(() => writeCutRecoveryCopy(storage, copy())).toThrow(/not been enabled/);
    expect(storage.length).toBe(0);
  });
  it("retains independent writers and does not read another account or project", () => {
    const storage = enabled(), first = writeCutRecoveryCopy(storage, copy()), second = writeCutRecoveryCopy(storage, copy({ writerId: id(4) }));
    expect(readCutRecoveryCopies(storage, first).map((row) => row.writerId).sort()).toEqual([first.writerId, second.writerId].sort());
    expect(readCutRecoveryCopies(storage, { ...first, userId: 2 })).toEqual([]);
    expect(readCutRecoveryCopies(storage, { ...first, businessId: id(5) })).toEqual([]);
    expect(readCutRecoveryCopies(storage, { ...first, projectId: id(5) })).toEqual([]);
  });
  it("does not remove a newer observed revision of the same writer", () => {
    const storage = enabled(), first = writeCutRecoveryCopy(storage, copy());
    const later = writeCutRecoveryCopy(storage, copy({ updatedAt: first.updatedAt + 1, edl: { version: 1, clips: [{ start: .1, end: 1 }] } }));
    removeCutRecoveryCopy(storage, first);
    expect(readCutRecoveryCopies(storage, first)).toEqual([later]);
    removeCutRecoveryCopy(storage, later); expect(readCutRecoveryCopies(storage, first)).toEqual([]);
  });
  it("expires this scope's records without touching unrelated browser data", () => {
    const storage = enabled(), first = writeCutRecoveryCopy(storage, copy());
    storage.setItem("other-product:draft", "keep");
    expect(readCutRecoveryCopies(storage, first, first.updatedAt + CUT_RECOVERY_TTL_MS + 1)).toEqual([]);
    expect(storage.getItem("other-product:draft")).toBe("keep");
  });
  it("bounds account copy count and makes room only for expired records", () => {
    const storage = enabled(), now = Date.now();
    for (let n = 0; n < 10; n++) writeCutRecoveryCopy(storage, copy({ writerId: id(n + 10), updatedAt: now }));
    expect(() => writeCutRecoveryCopy(storage, copy({ writerId: id(100), updatedAt: now }))).toThrow(/ten/);
    expect(() => writeCutRecoveryCopy(storage, copy({ writerId: id(100), updatedAt: now + CUT_RECOVERY_TTL_MS + 1 }), now + CUT_RECOVERY_TTL_MS + 1)).not.toThrow();
    expect(readCutRecoveryCopies(storage, copy(), now + CUT_RECOVERY_TTL_MS + 1)).toHaveLength(1);
  });
  it("rejects oversized, malformed, forged-scope and invalid revision records", () => {
    const storage = enabled(), initial = copy();
    for (const invalid of [{ baseRevision: 0 }, { writerId: "bad:writer" }, { userId: 0 }, { edl: { version: 99, clips: [] } }, { edl: { version: 1, clips: [{ start: 0, end: 1 }], excess: "x".repeat(300000) } }]) expect(() => writeCutRecoveryCopy(storage, { ...initial, ...invalid } as CutRecoveryCopy)).toThrow();
    const saved = writeCutRecoveryCopy(storage, initial);
    const key = [...storage.values.keys()].find((key) => key.endsWith(saved.writerId))!;
    storage.setItem(key, JSON.stringify({ ...saved, userId: 2 }));
    expect(readCutRecoveryCopies(storage, initial)).toEqual([]);
  });
  it("opt-out clears this account only and preserves server-independent data", () => {
    const storage = enabled(); writeCutRecoveryCopy(storage, copy());
    storage.setItem(recoveryPreferenceKey(2), "true");
    writeCutRecoveryCopy(storage, copy({ userId: 2 }));
    storage.setItem("other-product:draft", "keep");
    disableCutRecovery(storage, 1);
    expect(readCutRecoveryCopies(storage, copy())).toEqual([]);
    expect(readCutRecoveryCopies(storage, copy({ userId: 2 }))).toHaveLength(1);
    expect(storage.getItem("other-product:draft")).toBe("keep");
  });
  it("propagates unavailable/quota storage rather than returning a false saved receipt", () => {
    const storage = enabled(); storage.setItem = () => { throw new Error("QuotaExceededError"); };
    expect(() => writeCutRecoveryCopy(storage, copy())).toThrow("QuotaExceededError");
  });
});
