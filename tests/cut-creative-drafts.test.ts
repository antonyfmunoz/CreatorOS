import { describe, expect, it } from 'vitest';
import { CutCreativeDrafts } from '../client/src/lib/cut-creative-drafts';
type Row = { id: string; revision: number; manifest: { text: string } };
const row = (id: string, text: string, revision = 1): Row => ({ id, revision, manifest: { text } });
const create = () => new CutCreativeDrafts<Row, 'manifest'>('manifest');

describe('independent creative draft custody', () => {
  it('refreshes saved items without replacing another unsaved row', () => {
    const drafts = create(); const a = row('a', 'A'), b = row('b', 'B');
    drafts.edit(a, { text: 'A draft' }); drafts.edit(b, { text: 'B draft' });
    const submitted = drafts.view([a, b])[0]; drafts.beginSave(submitted);
    drafts.saved(submitted, row('a', 'A draft', 2));
    expect(drafts.view([row('a', 'A draft', 2), b, row('c', 'New')])).toEqual([row('a', 'A draft', 2), row('b', 'B draft'), row('c', 'New')]);
    expect(drafts.size).toBe(1);
  });
  it('keeps a draft on its original revision across remote changes or deletion', () => {
    const drafts = create(); const a = row('a', 'original');
    drafts.edit(a, { text: 'local' });
    expect(drafts.view([row('a', 'remote', 2)])[0]).toEqual(row('a', 'local'));
    expect(drafts.conflicts([row('a', 'remote', 2)])).toBe(1);
    expect(drafts.view([])).toEqual([row('a', 'local')]);
    expect(drafts.conflicts([])).toBe(1);
    drafts.clear(); expect(drafts.view([])).toEqual([]);
  });
  it('preserves a newer edit and advances only its own successful save baseline', () => {
    const drafts = create(); const a = row('a', 'original');
    drafts.edit(a, { text: 'submitted' }); const submitted = drafts.view([a])[0];
    drafts.beginSave(submitted); drafts.edit(submitted, { text: 'newer' });
    drafts.saved(submitted, row('a', 'submitted', 2));
    expect(drafts.view([row('a', 'submitted', 2)])[0]).toEqual(row('a', 'newer', 2));
    expect(drafts.conflicts([row('a', 'submitted', 2)])).toBe(0);
  });
  it('does not lose an undo back to the original value while a save is in flight', () => {
    const drafts = create(); const a = row('a', 'original');
    drafts.edit(a, { text: 'submitted' }); const submitted = drafts.view([a])[0]; drafts.beginSave(submitted);
    drafts.edit(submitted, { text: 'original' }); expect(drafts.has('a')).toBe(true);
    drafts.saved(submitted, row('a', 'submitted', 2));
    expect(drafts.view([row('a', 'submitted', 2)])[0]).toEqual(row('a', 'original', 2));
  });
  it('retains failed or uncertain saves, rejects wrong receipts, and clears an ordinary undo', () => {
    const drafts = create(); const a = row('a', 'original'); drafts.edit(a, { text: 'new' });
    const submitted = drafts.view([a])[0]; drafts.beginSave(submitted); drafts.endPending();
    expect(drafts.has('a')).toBe(true);
    for (const saved of [row('other', 'new', 2), row('a', 'new', 1), row('a', 'new', NaN)]) expect(() => drafts.saved(submitted, saved)).toThrow();
    drafts.edit(submitted, { text: 'original' }); expect(drafts.size).toBe(0);
  });

  it('preserves an explicit return to the old value after remote change or deletion', () => {
    for (const remote of [row('a', 'remote', 2), null]) {
      const drafts = create(); const original = row('a', 'original');
      drafts.edit(original, { text: 'local' });
      const current = drafts.view(remote ? [remote] : [])[0];
      drafts.edit(current, { text: 'original' }, remote);
      expect(drafts.has('a')).toBe(true);
      expect(drafts.view(remote ? [remote] : [])[0]).toEqual(original);
      expect(drafts.conflicts(remote ? [remote] : [])).toBe(1);
    }
  });
});
