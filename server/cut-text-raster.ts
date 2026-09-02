import type { CutEdl } from "../shared/cut-studio";

type Graphic = NonNullable<CutEdl["graphics"]>[number];

export function cutTextRasterMetrics(graphic: Pick<Graphic, "fontSize" | "fontReferenceWidth">, canvasWidth: number) {
  if (!Number.isInteger(canvasWidth) || canvasWidth < 2 || canvasWidth > 7_680) throw new Error("Invalid text delivery width");
  if (!Number.isFinite(graphic.fontSize) || graphic.fontSize < 12 || graphic.fontSize > 160) throw new Error("Invalid title font size");
  const reference = graphic.fontReferenceWidth;
  if (reference !== undefined && (!Number.isInteger(reference) || reference < 240 || reference > 7_680)) throw new Error("Invalid title reference width");
  const scale = reference === undefined ? 1 : canvasWidth / reference;
  return { fontSize: Math.max(1, graphic.fontSize * scale), padding: Math.max(1, Math.round(12 * scale)) };
}

export function cutTextRasterSource(width: number, height: number) {
  if (![width, height].every((value) => Number.isInteger(value) && value >= 2 && value <= 7_680)) throw new Error("Invalid text raster dimensions");
  // Request RGBA in the source graph. Converting an already-YUV color source
  // in -vf cannot recover the discarded alpha and makes the entire box black.
  return `color=c=black@0.0:s=${width}x${height},format=rgba`;
}

export function cutTextRasterFilter(graphic: Pick<Graphic, "fontSize" | "fontReferenceWidth" | "textColor" | "backgroundColor" | "backgroundOpacity">, canvasWidth: number, fontFilter: string, escapedTextPath: string) {
  const { fontSize, padding } = cutTextRasterMetrics(graphic, canvasWidth);
  // Text is a UTF-8 file, never filter syntax. Paths and the font filter are
  // constructed by the worker from its private materialized files only.
  return `drawtext=${fontFilter}textfile='${escapedTextPath}':expansion=none:fontsize=${fontSize}:fontcolor=${graphic.textColor}:x=${padding}:y=(h-text_h)/2:box=1:boxcolor=${graphic.backgroundColor}@${graphic.backgroundOpacity}:boxborderw=${padding}`;
}
