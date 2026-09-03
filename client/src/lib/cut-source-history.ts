import type { CutSourceFile } from "@shared/cut-code-authoring";

export type CutSourceSnapshot = { files: CutSourceFile[]; entrypoint: string };
type Entry = { snapshot: CutSourceSnapshot; bytes: number };
const clone = (source: CutSourceSnapshot): CutSourceSnapshot => ({ entrypoint: source.entrypoint, files: source.files.map((file) => ({ ...file })) });
const same = (a: CutSourceSnapshot, b: CutSourceSnapshot) => a.entrypoint === b.entrypoint && a.files.length === b.files.length && a.files.every((file, index) => file.path === b.files[index].path && file.content === b.files[index].content);
const entry = (source: CutSourceSnapshot): Entry => ({ snapshot: clone(source), bytes: source.entrypoint.length * 2 + 128 + source.files.reduce((sum, file) => sum + (file.path.length + file.content.length) * 2 + 128, 0) });

// A bounded, project-mount-local history of source data only. Persistence status
// is deliberately not part of a snapshot: undo must never manufacture a save.
export class CutSourceHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  constructor(private readonly maximumSteps = 40, private readonly maximumBytes = 8 * 1024 * 1024) {
    if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1 || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("History limits must be positive safe integers.");
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get retainedBytes() { return [...this.past, ...this.future].reduce((sum, item) => sum + item.bytes, 0); }
  reset() { this.past = []; this.future = []; }
  record(previous: CutSourceSnapshot, next: CutSourceSnapshot) {
    if (same(previous, next)) return;
    this.past.push(entry(previous)); this.future = []; this.trim();
  }
  undo(current: CutSourceSnapshot) {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(entry(current)); this.trim();
    return clone(previous.snapshot);
  }
  redo(current: CutSourceSnapshot) {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(entry(current)); this.trim();
    return clone(next.snapshot);
  }
  private trim() {
    while (this.past.length + this.future.length > this.maximumSteps || this.retainedBytes > this.maximumBytes) {
      if (this.past.length) this.past.shift();
      else if (this.future.length) this.future.shift();
      else break;
    }
  }
}
