import type { CutClip } from "./cut-studio";

/** Native export and primary preview share the same edited-time fade contract.
 * Segment indices include black gaps in the multitrack primary plan. */
export function cutClipFades(clip: Pick<CutClip, "transition" | "fadeIn" | "fadeOut">, duration: number, index: number, count: number) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) {
    throw new Error("Invalid clip fade timing");
  }
  const transition = clip.transition === "fade_black" ? Math.min(0.35, duration / 2) : 0;
  return {
    fadeIn: Math.min(Math.max(clip.fadeIn ?? 0, index > 0 ? transition : 0), duration / 2),
    fadeOut: Math.min(Math.max(clip.fadeOut ?? 0, index < count - 1 ? transition : 0), duration / 2),
  };
}
