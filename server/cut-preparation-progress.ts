export function cutPreparationProgress(index: number, total: number, fraction = 0) {
  if (!Number.isInteger(total) || total < 1 || total > 500 || !Number.isInteger(index) || index < 0 || index >= total || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error("Invalid native preparation progress");
  return { progress: .1 + .2 * (index + fraction) / total, detail: `Preparing graphics · layer ${index + 1}/${total} · ${Math.round(fraction * 100)}%` };
}
