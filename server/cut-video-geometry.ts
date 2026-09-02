function dimension(value: number) {
  if (!Number.isInteger(value) || value < 2 || value > 8192 || value % 2) throw new Error("Video dimensions must be bounded positive even integers");
  return value;
}

/** Match source-aspect scaling for a fixed multitrack canvas, including SAR and
 * the quarter-turn display rotation FFmpeg applies before filtering. */
export function cutSourceRenditionSize(source: { width?: number; height?: number; sampleAspectRatio?: string; rotation?: number }, height: number): [number, number] {
  dimension(height);
  if (!Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width! <= 0 || source.height! <= 0) throw new Error("Source video geometry is unavailable");
  const sar = source.sampleAspectRatio;
  let pixelAspect = 1;
  if (sar && sar !== "N/A" && sar !== "0:1") {
    const parts = sar.split(":").map(Number);
    if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Source pixel aspect is invalid");
    pixelAspect = parts[0] / parts[1];
  }
  let aspect = source.width! * pixelAspect / source.height!;
  const rotation = source.rotation ?? 0;
  if (!Number.isFinite(rotation)) throw new Error("Source rotation is invalid");
  if (Math.abs(Math.abs(rotation % 180) - 90) < .001) aspect = 1 / aspect;
  return [Math.max(2, Math.trunc(Math.min(3840, height * aspect) / 2) * 2), Math.max(2, Math.trunc(Math.min(height, 3840 / aspect) / 2) * 2)];
}

/** Fit displayed source geometry, then remove inherited anamorphic metadata. */
export function cutFitVideoFilters(width: number, height: number): string[] {
  dimension(width); dimension(height);
  return [
    `scale=w='max(2,trunc(min(${width},${height}*dar)/2)*2)':h='max(2,trunc(min(${height},${width}/dar)/2)*2)'`,
    "setsar=1",
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
  ];
}

/** Preserve the displayed source aspect while bounding both output dimensions. */
export function cutSourceVideoFilters(height: number): string[] {
  dimension(height);
  return [
    `scale=w='max(2,trunc(min(3840,${height}*dar)/2)*2)':h='max(2,trunc(min(${height},3840/dar)/2)*2)'`,
    "setsar=1",
  ];
}
