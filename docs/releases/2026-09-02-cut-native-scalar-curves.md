# Native authored scalar curves

This follow-up retains bounded declarative curve metadata on newly compiled 2D
graphics. Native position, scale, rotation, opacity, brightness and saturation
expressions use the authored interpolation/transition formulas and composition
frame grid. Older immutable snapshots do not acquire default curve fields.
Projected 3D keeps its explicitly separate legacy path; blur/reveals/effects are
not made frame-exact by this change.

The preceding candidate approximated nonlinear curves with sparse linear samples.
An owned 90-frame, 1920-wide, x=0.1-to-0.8 spring study found 158.818 pixels of
horizontal error at frame 14. The new numeric evaluator matches the public
composition evaluator at every tested authored frame, including combined,
overlapping and clipped slide/fade/zoom transitions. Native formulas are generated
from validated numbers and enums, never accepted as user executable/filter text.

Graphic surface planning includes authored scale extrema. The existing fifty
essential-motion-boundary limit remains; this is not unlimited keyframe capacity.
Generated filter graphs use a private job-temporary file to avoid OS argument
limits, with an 8 MiB compilation cap and existing job-directory cleanup. This
does not change the ordinary native worker into an executable-code service.

## Retained qualification and correction

- Initial local root run passed 642 tests, TypeScript, production build, bundle
  budgets and Worker dry-run: `cut-native-curves-verify.log`.
- Initial targeted browser run: six passed and four failed. The failing saved-
  composition and motion-boundary cases on both devices exposed a one-frame
  timestamp issue. Evidence remains under
  `B:/CreatorOS-cut-native-curves/test-results/creativesos-browser-qualification-f1f5f0b099ec498f9428685d5bd505bb`.
- The isolated formula test initially used a rational frame timebase, whereas the
  main pipeline uses AVTB microsecond ticks. With AVTB, the old floating-point
  epsilon could choose the preceding composition frame. The independent AVTB
  reproduction measured alpha error 2 for linear and 16 for spring; the corrected
  one-microsecond boundary compensation produced zero for both and step.
- The permanent formula check now exercises both rational and AVTB timebases,
  all six easing types, and 24/30/60 fps delivery. The saved composition test keeps
  its two-pixel position tolerance; no render or test deadline was increased.
- The revised focused suite passed 41 tests. Final revised root/browser, protected
  checks, merge and deployment are pending at this documentation checkpoint.

The browser proof measures six independently animated rows at eight selected
frames; the native formula proof covers every output frame in its small synthetic
workload. Neither establishes all-pixel equivalence, general timeline preview,
3D/shader/HDR parity, scaled performance, or superiority to Remotion.
