# Primary timeline placement and gap qualification

V3 primary-video exports now sort clips by explicit timeline placement and retain
leading/interior empty spans as black frames with silence. The render also keeps
the complete timeline duration, including audio or graphic tails after V1 ends,
instead of shortening everything to the sum of primary clip lengths. Existing
contiguous cross-dissolves retain their separately qualified behavior.

Overlapping primary clips have no previously qualified overlap-resolution rule.
They now fail ordinary export admission with a useful instruction to trim, move,
or layer on another track, rather than silently producing concatenated output at
the wrong times. This is explicit rejection, not a claim of overlap-editing parity.

Local 2026-09-02 evidence:

- Three pure planning tests cover sorting, speed, leading/interior/tail gaps,
  nonmutation, the unchanged contiguous fast path and overlap rejection.
- Full local verification passed 583 tests in 142 files, TypeScript, the
  application build, bundle budgets and worker type/dry-run checks.
- Eight actual browser journeys passed across mobile and desktop: new gaps,
  primary multi-source/aspect/soundtrack behavior, existing cross-dissolves and
  audible primary preview gain/mute. No gate or timeout was relaxed.
- The new owned test sources render to exactly 150 video frames at 30 FPS, about
  five seconds. Decoded pixels are black at 0.5/2.5/4.5 seconds, red at 1.5 and
  green at 3.5. Decoded RMS verifies silent leading/interior spans and audible
  primary/tail spans. RMS verifies level, not spectral identity.
- A deliberately overlapping edit returns HTTP 400 before an ordinary render
  job is admitted. Existing composition workers repeat planning validation.

Logs: `primary-gaps-unit.log`, `primary-gaps-browser-2.log` and its error stream
under `B:/CreativesOS-task-artifacts`. The first harness attempt stalled on Windows
redirected inherited output handles; its disposable server was stopped and the
unchanged suite rerun with direct file-backed process streams. It is not counted
as a passing test. Protected CI and exact production artifact evidence remain
required before these changes are described as production-qualified.

Not covered: full edited-timeline live playback, overlapping-primary composition,
subframe timing across every frame rate, long/VFR media, or Remotion equivalence.
