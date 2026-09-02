export function cutRenderDurationArgs(durationSeconds: number): ["-t", string] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("A CutStudio render requires a finite positive timeline duration");
  }

  return ["-t", Math.max(0.001, durationSeconds).toFixed(3)];
}

/** Every raster input must reach EOF even when its image is looped. */
export function cutRasterInputArgs(input: { path: string; animated: boolean }, fps: number, durationSeconds: number) {
  if (!Number.isInteger(fps) || fps < 1 || fps > 120 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("A raster input requires finite frame timing");
  const frames = Math.ceil(durationSeconds * fps);
  if (!Number.isSafeInteger(frames)) throw new Error("A raster input requires bounded frame timing");
  // Round up to the next whole delivery frame, never truncate a needed final
  // source frame. Output duration still has its separate unchanged boundary.
  const inputDuration = (frames / fps).toFixed(9);
  // Every PNG input otherwise creates its own automatic decoder pool. A scene
  // with many independent rasters can start hundreds of threads before the
  // filter graph/encoder do any work. Scope this limit to the raster decoder;
  // source-video decoding, graph scheduling and output encoding are unchanged.
  return [...(input.animated ? [] : ["-loop", "1"]), "-framerate", String(fps), "-t", inputDuration, "-threads:v", "1", "-i", input.path];
}
