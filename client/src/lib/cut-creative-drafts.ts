type RevisionRow = { id: string; revision: number };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** In-memory only. A refresh never rebases an unsaved edit onto another writer. */
export class CutCreativeDrafts<T extends RevisionRow, K extends keyof T> {
  private drafts = new Map<string, { base: T; value: T }>();
  private pending = new Set<string>();
  private unconfirmed = new Set<string>();
  constructor(private key: K) {}
  get size() { return this.drafts.size; }
  has(id: string) { return this.drafts.has(id); }
  clear() { this.drafts.clear(); this.pending.clear(); this.unconfirmed.clear(); }
  beginSave(row: T) {
    this.pending.add(row.id);
    if (!this.drafts.has(row.id)) this.drafts.set(row.id, { base: row, value: row });
  }
  endPending() {
    // A failed response does not prove the server failed to commit. Do not call
    // an undo clean until a later save is acknowledged or the user discards it.
    this.pending.forEach((id) => this.unconfirmed.add(id));
    this.pending.clear();
  }

  edit(row: T, value: T[K], latestSaved: T | null = row) {
    const base = this.drafts.get(row.id)?.base ?? row;
    // Reverting to the old baseline is not a clean undo if another writer has
    // since changed or removed that record. Preserve that explicit local value.
    if (latestSaved?.revision === base.revision && same(value, base[this.key]) && !this.pending.has(row.id) && !this.unconfirmed.has(row.id)) this.drafts.delete(row.id);
    else this.drafts.set(row.id, { base, value: { ...row, revision: base.revision, [this.key]: value } });
  }

  view(rows: T[]): T[] {
    const ids = new Set(rows.map((row) => row.id));
    return [...rows.map((row) => this.drafts.get(row.id)?.value ?? row),
      ...Array.from(this.drafts).filter(([id]) => !ids.has(id)).map(([, entry]) => entry.value)];
  }

  conflicts(rows: T[]) {
    const revisions = new Map(rows.map((row) => [row.id, row.revision]));
    return Array.from(this.drafts).filter(([id, entry]) => revisions.get(id) !== entry.base.revision).length;
  }

  saved(submitted: T, saved: T) {
    if (saved.id !== submitted.id || !Number.isInteger(saved.revision) || saved.revision <= submitted.revision) throw new Error('The saved creative revision could not be confirmed.');
    this.pending.delete(submitted.id);
    this.unconfirmed.delete(submitted.id);
    const current = this.drafts.get(submitted.id);
    if (!current) return;
    if (same(current.value[this.key], submitted[this.key])) this.drafts.delete(submitted.id);
    else this.drafts.set(submitted.id, { base: saved, value: { ...saved, [this.key]: current.value[this.key] } });
  }
}
