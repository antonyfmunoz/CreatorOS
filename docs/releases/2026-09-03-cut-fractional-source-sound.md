# Fractional source-sound loops: candidate, not production

The next isolated CutStudio runtime candidate extends imported video sound to
periods/phases that are not aligned to composition frames. It does not enable
public TSX execution or change provider/worker privileges.

## Implementation

- The collector recognizes a continuous repeated media clock as one soundtrack
  interval. Authored remounts, source/speed changes and clock discontinuities still
  create separate intervals; eight combined soundtrack intervals remain the cap.
- Loop periods use a bounded rational intermediate audio clock, rather than
  rounding every loop to 48 kHz output samples. Supported clocks are 48–192 kHz;
  .1001 seconds uses 50 kHz and 5,005 samples. The continuous result is resampled
  once to the ordinary 48 kHz output, preventing cumulative NTSC drift.
- Delayed audio onset, selected stream, early audio EOF, source phase, range
  exports and per-frame gain remain bound to the video's container-relative
  clock. Silence at the end of a short soundtrack remains inside each period.
- Loop caching explicitly uses stereo float32. At most 64 MiB per loop and
  128 MiB combined PCM are admitted. This is an additional bound, not a claim
  that all decoder/resampler/renderer memory fits without OS enforcement.
- At exactly 1x speed, the runtime bypasses time stretching. FFmpeg's WSOLA tail
  processing can alter a nonstationary source even at 1x; other supported speeds
  still use the existing pitch-preserving filter.

## Evidence at this checkpoint

- 81 runtime unit/type/compile checks passed before the unity-tail correction.
  Focused units after the correction passed. Private loop fields remain stripped
  from public request input; no new arbitrary filter expressions are admitted.
- Initial host-only stationary-tone diagnostics passed, including NTSC cycle
  continuity, but did **not** establish container or nonstationary-tail quality.
- Actual container run `fractional-audio-output-20260903001200829` failed the
  independent changing-tone oracle: RMS error .03331943, peak .36628226, with the
  mismatch in the final two output frames. Original output and failure retained.
- Controlled host diagnostic `loop-unity-tail-20260903001505159` reproduced it:
  current filter RMS .03331945 versus 4.813e-9 after bypassing exactly-1x time
  stretching. Both produced 96,000 samples. No audio tolerance was relaxed.
- The next actual run `fractional-audio-output-20260903002015137` passed the full
  loop but failed the ranged oracle at exactly sample 4,800 (absolute sample
  16,000): its .25 gain had not yet advanced to .75. Floating seconds placed
  that boundary just below the intended frame. Frame-authored gains now compare
  integer sample thresholds, and explicit keyframes compare integer sample/frame
  products. The existing actual envelope/held-edge/range checks passed; the next
  complete corrected loop qualification remains required.

Local artifacts are under `B:/CreativesOS-task-artifacts`. Actual corrected
container output, range/replay/source-lifecycle regressions, complete isolated
and production-candidate suites, package/image scans and protected application
checks are still required. These receipts are not a public feature or Remotion
parity verdict. The isolated runtime's existing deadlines and source/output
caps, approved separate production execution boundary and human benchmarks remain.
