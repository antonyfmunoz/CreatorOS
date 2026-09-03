import type { CutClip } from "./cut-studio";

export type CutClipPreviewState = {
  active: boolean;
  sourceTime: number;
  localSeconds: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
};

function valueAt(clip: CutClip, property: "x" | "y" | "scale" | "opacity", fallback: number, seconds: number) {
  const points = [{ at: 0, value: fallback, easing: "linear" as const }, ...(clip.motionKeyframes ?? []).flatMap((point) => typeof point[property] === "number" ? [{ at: point.at, value: point[property]!, easing: point.easing ?? "linear" as const }] : [])]
    .sort((left, right) => left.at - right.at)
    .filter((point, index, all) => index === all.length - 1 || Math.abs(point.at - all[index + 1].at) > .0005);
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index], right = points[index + 1];
    if (seconds >= right.at) continue;
    const progress = Math.max(0, Math.min(1, (seconds - left.at) / (right.at - left.at)));
    const eased = right.easing === "ease_in_out" ? progress * progress * (3 - 2 * progress) : progress;
    return left.value + (right.value - left.value) * eased;
  }
  return points.at(-1)!.value;
}

/** The browser counterpart to native overlay position, scale and alpha filters. */
export function cutClipPreviewAt(clip: CutClip, timelineSeconds: number): CutClipPreviewState {
  const timelineStart = clip.timelineStart ?? 0;
  const speed = clip.speed ?? 1;
  const localSeconds = timelineSeconds - timelineStart;
  const duration = (clip.end - clip.start) / speed;
  const transform = clip.transform ?? { x: 0, y: 0, width: 1, height: 1, opacity: 1 };
  return {
    active: Number.isFinite(timelineSeconds) && localSeconds >= 0 && localSeconds < duration,
    sourceTime: clip.start + Math.max(0, localSeconds) * speed,
    localSeconds,
    x: valueAt(clip, "x", transform.x, localSeconds),
    y: valueAt(clip, "y", transform.y, localSeconds),
    scale: valueAt(clip, "scale", 1, localSeconds),
    opacity: Math.max(0, Math.min(1, valueAt(clip, "opacity", transform.opacity, localSeconds))),
  };
}
