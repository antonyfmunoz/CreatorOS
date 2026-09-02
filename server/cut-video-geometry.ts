function dimension(value: number) {
  if (!Number.isInteger(value) || value < 2 || value > 8192 || value % 2) throw new Error("Video dimensions must be bounded positive even integers");
  return value;
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
