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

## Corrected exact-source evidence

At `da0e0a2dcbd9790fda0163bc0f3fa0e7cac6cbaa`, focused actual container run
`fractional-audio-output-20260903002326023` passed 17 output checks. Full/range
changing-tone RMS errors were .00001253786 / .00001252645; peak error was
.00002157968. NTSC five-period drift RMS/peak were zero with nonzero signal
RMS .06620430. All original tolerances remain unchanged.

Protected runtime `33699497738` independently passed **86 records per image**:

- Isolated: `sha256:71d1f925367674f965d525acd9cf383a707d0b4787414bd7137a630b6403e22f`.
- Candidate: `sha256:cb642f180069e21a0e38e9a53d3e4b4ff3acf58720ee34050e7b96dba3efc44c`.
- Candidate vulnerability scan: zero HIGH/CRITICAL findings.
- Verify `33699497742`: 689 root tests; 192 mobile + 168 desktop browser passes,
  24 pre-existing desktop skips, no retries. CodeQL `33699497772` passed.

The separate full local run `fractional-source-full-20260903002816520` passed
units/audit/build/host audio/image audio/the complete isolated suite, but its
candidate suite failed Docker's unchanged 15-second create deadline after the
text and composition-audio checks. The named failed container was confirmed
absent afterward. Candidate scan was not reached locally; this is **not a local
full-pass receipt**. It is retained alongside the independent CI success.

Updating the branch to current main requires new protected checks; earlier
receipts apply to their exact source, not an untested merge. Local artifacts
are under `B:/CreativesOS-task-artifacts`. Public executable service integration,
the approved separate execution boundary and human competitor benchmarks remain.
