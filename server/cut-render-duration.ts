export function cutRenderDurationArgs(durationSeconds: number): ["-t", string] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("A CutStudio render requires a finite positive timeline duration");
  }

  return ["-t", Math.max(0.001, durationSeconds).toFixed(3)];
}
