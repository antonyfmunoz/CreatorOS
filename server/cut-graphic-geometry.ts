import type { CutGraphicCurves } from "../shared/cut-graphic-curves";

type GraphicGeometry = {
  width: number; height: number; rotation: number; rotationX: number; rotationY: number;
  anchorX?: number; anchorY?: number;
  compositionCurves?: CutGraphicCurves;
  motionKeyframes?: Array<{ scale: number; rotation: number; rotationX: number; rotationY: number }>;
};
const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
const MAX_SURFACE_PIXELS = 16_777_216;
const MAX_WORKING_PIXELS = 67_108_864;

/** Allocation plan, not a claim of measured peak memory or all-filter coverage. */
export function planCutGraphicRaster(graphic: GraphicGeometry, outputWidth: number, outputHeight: number) {
  const width = even(graphic.width * outputWidth); const height = even(graphic.height * outputHeight);
  const authoredScale = graphic.compositionCurves?.curves.find((curve) => curve.property === "scale");
  const scales = [1, ...(graphic.motionKeyframes ?? []).map((keyframe) => keyframe.scale), ...(authoredScale ? [authoredScale.base, ...authoredScale.keyframes.map((point) => point.value)] : [])];
  if (scales.some((scale) => !Number.isFinite(scale) || scale < .01 || scale > 8)) throw new Error("Graphic scale must remain within 0.01 and 8");
  const minimumScale = Math.min(...scales); const maximumScale = Math.max(...scales);
  const maximumWidth = even(width * maximumScale); const maximumHeight = even(height * maximumScale);
  const has3d = [graphic, ...(graphic.motionKeyframes ?? [])].some((point) => Math.abs(point.rotationX) > .0001 || Math.abs(point.rotationY) > .0001);
  if (has3d && ((graphic.anchorX ?? .5) !== .5 || (graphic.anchorY ?? .5) !== .5)) throw new Error("Non-centered pivots are supported for 2D graphics; native 3D pivot support is not implemented yet");
  const rotated = [graphic, ...(graphic.motionKeyframes ?? [])].some((point) => Math.abs(point.rotation) > .0001);
  const virtualWidth = has3d ? even(maximumWidth * maximumScale / minimumScale) : maximumWidth;
  const virtualHeight = has3d ? even(maximumHeight * maximumScale / minimumScale) : maximumHeight;
  const diagonal = Math.max(2, Math.ceil(Math.hypot(maximumWidth, maximumHeight) / 2) * 2);
  const canvasWidth = rotated ? diagonal : maximumWidth; const canvasHeight = rotated ? diagonal : maximumHeight;
  const surfaces = [[width, height], [maximumWidth, maximumHeight], [canvasWidth, canvasHeight], ...(has3d ? [[virtualWidth, virtualHeight]] : [])];
  for (const [w, h] of surfaces) if (![w, h].every((value) => Number.isSafeInteger(value) && value >= 2 && value <= 8192) || w * h > MAX_SURFACE_PIXELS) throw new Error("Graphic raster exceeds the native size budget; reduce its dimensions or scale range");
  return { width, height, minimumScale, maximumScale, maximumWidth, maximumHeight, virtualWidth, virtualHeight, canvasWidth, canvasHeight, has3d, rotated, workingPixels: surfaces.reduce((sum, [w, h]) => sum + w * h, 0) };
}

export function planCutGraphicRasters(graphics: GraphicGeometry[], outputWidth: number, outputHeight: number) {
  const plans = graphics.map((graphic) => planCutGraphicRaster(graphic, outputWidth, outputHeight));
  if (plans.reduce((sum, plan) => sum + plan.workingPixels, 0) > MAX_WORKING_PIXELS) throw new Error("Combined graphics exceed the native raster budget; reduce layer sizes or render separately");
  return plans;
}

/** Offset from authored top-left to a centered, transformed raster canvas. */
export function cutGraphicPivotOffset(width: number, height: number, canvasWidth: number, canvasHeight: number, scale: number, rotation: number, anchorX = .5, anchorY = .5) {
  const radians = rotation * Math.PI / 180; const x = (anchorX - .5) * width * scale; const y = (anchorY - .5) * height * scale;
  return { x: anchorX * width - Math.cos(radians) * x + Math.sin(radians) * y - canvasWidth / 2, y: anchorY * height - Math.sin(radians) * x - Math.cos(radians) * y - canvasHeight / 2 };
}
