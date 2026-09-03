import { evaluateCutGraphicCurve } from "./cut-graphic-curves";
import type { CutGraphic } from "./cut-studio";

export type CutGraphicPreviewState = {
  active: boolean;
  localSeconds: number;
  localFrame: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  rotationX: number;
  rotationY: number;
  perspective: number;
  opacity: number;
  blur: number;
  brightness: number;
  saturation: number;
  revealProgress: number;
};

function keyframeValue(graphic: CutGraphic, property: "x" | "y" | "scale" | "rotation" | "rotationX" | "rotationY" | "perspective" | "opacity" | "blur" | "brightness" | "saturation" | "revealProgress", fallback: number, localSeconds: number) {
  const points = [{ at: 0, value: fallback }, ...(graphic.motionKeyframes ?? []).map((point) => ({ at: point.at, value: point[property] }))]
    .filter((point): point is { at: number; value: number } => typeof point.value === "number")
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > .0005);
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index], right = points[index + 1];
    if (localSeconds >= right.at) continue;
    const progress = Math.max(0, Math.min(1, (localSeconds - left.at) / (right.at - left.at)));
    return left.value + (right.value - left.value) * progress;
  }
  return points.at(-1)!.value;
}

/** Browser preview state for native timeline graphics. Composition curves take
 * precedence exactly as they do in the renderer; legacy point interpolation is
 * intentionally linear because the current native filter compiler is linear. */
export function cutGraphicPreviewAt(graphic: CutGraphic, timelineSeconds: number, fps = 30): CutGraphicPreviewState {
  const localSeconds = timelineSeconds - graphic.timelineStart;
  const active = Number.isFinite(timelineSeconds) && localSeconds >= 0 && localSeconds < graphic.duration;
  const localFrame = Math.max(0, Math.min(Math.max(0, Math.ceil(graphic.duration * fps) - 1), Math.floor(localSeconds * fps)));
  const curve = <T extends "x" | "y" | "scale" | "rotation" | "opacity" | "brightness" | "saturation">(property: T, fallback: number) => graphic.compositionCurves
    ? evaluateCutGraphicCurve(graphic.compositionCurves, property, localFrame) ?? fallback
    : keyframeValue(graphic, property, fallback, localSeconds);
  return {
    active,
    localSeconds,
    localFrame,
    x: curve("x", graphic.x),
    y: curve("y", graphic.y),
    scale: curve("scale", 1),
    rotation: curve("rotation", graphic.rotation),
    rotationX: keyframeValue(graphic, "rotationX", graphic.rotationX, localSeconds),
    rotationY: keyframeValue(graphic, "rotationY", graphic.rotationY, localSeconds),
    perspective: keyframeValue(graphic, "perspective", graphic.perspective, localSeconds),
    opacity: Math.max(0, Math.min(1, curve("opacity", 1))),
    blur: keyframeValue(graphic, "blur", graphic.blur, localSeconds),
    brightness: curve("brightness", graphic.brightness),
    saturation: curve("saturation", graphic.saturation),
    revealProgress: keyframeValue(graphic, "revealProgress", graphic.revealProgress, localSeconds),
  };
}
