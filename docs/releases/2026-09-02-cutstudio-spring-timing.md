# Native spring timing: bounded settling and duration fitting

## Capability and scope

Authors can measure a physical spring's settling duration, fit it to a chosen
frame interval, delay or reverse that interval, and hold its endpoints. This
closes a specific motion-authoring gap in the native TSX prototype, not the
remaining public-execution or Remotion-parity gates.

The reference capabilities were reviewed in the official
[spring](https://www.remotion.dev/docs/spring) and
[measurement](https://www.remotion.dev/docs/measure-spring) documentation.
No source implementation was copied. Our flat physical parameters, conservative
duration contract and bounded measurement limits remain explicitly our own API.

## Mathematical contract

The existing closed-form damped oscillator is retained for unfitted motion.
For an underdamped response the absolute displacement is bounded by its decaying
sinusoidal envelope. For critical and overdamped responses the displacement is
positive and monotone. Binary search finds a whole frame where this bound is at
most the requested relative tolerance. It cannot declare completion merely
because one sample happens to cross the target. The envelope can return a later
duration than the last actual threshold crossing; no exact competitor-duration
equivalence is asserted.

Measurements reject undamped motion and fail if the bound does not settle within
the configured budget. A maximum of 256 measurements are cached. Fitted motion
rescales physical time inside its active interval and holds exact endpoints
outside it; the final snap is bounded by the requested tolerance. Ordinary
unfitted undamped oscillation is still supported.

## Qualification

Local runtime suite: 22 passed. Tests cover every damping regime, near-critical
parameters, fractional-frame future samples, tighter tolerances, budget failure,
delay, reversal, holding, and typed authoring. Existing output/security gates
are unchanged. The isolated harness additionally requires actual PNG pixels at
four start/delay/end/post-end frames. Protected container qualification, release
and production availability must be recorded separately; they are not claimed
by these local unit results.
