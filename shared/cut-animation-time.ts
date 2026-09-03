export type CutLottieTiming = { frameRate: number; inPoint: number; outPoint: number };

/** Lottie's seek API is relative: the player itself adds its firstFrame/ip. */
export function cutLottieFrameAtTime(seconds: number, timing: CutLottieTiming) {
  const length = Math.floor(timing.outPoint - timing.inPoint);
  if (![seconds, timing.frameRate, timing.inPoint, timing.outPoint].every(Number.isFinite)
    || seconds < 0 || timing.frameRate < 1 || timing.frameRate > 120 || length < 1) {
    throw new Error("Invalid Lottie animation timing");
  }
  const frame = seconds * timing.frameRate;
  if (!Number.isFinite(frame) || frame > Number.MAX_SAFE_INTEGER) throw new Error("Lottie seek exceeds its timing budget");
  return frame % length;
}
