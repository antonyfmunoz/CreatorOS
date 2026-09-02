/** Resolve a source clock without turning floating-point loop boundaries into EOF. */
export function videoSourceTime(time, duration, repeat) {
  if (!Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0 || typeof repeat !== 'boolean') throw new Error('Invalid private video source clock.');
  if (!repeat) return time;
  // Division/multiplication and JavaScript remainder can round in opposite
  // directions: 6.6 % .6 is .5999999999999999, not the start of loop eleven.
  // Snap only arithmetic roundoff, NOT a frame, sample or fixed time window.
  const boundary = Math.round(time / duration) * duration;
  const roundoff = Number.EPSILON * Math.max(time, duration) * 4;
  if (Math.abs(time - boundary) <= roundoff) return 0;
  return time % duration;
}
