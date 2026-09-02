# Native private-mask and preview-origin correction

The native composition preview now treats layer x/y as top-left coordinates,
matching the manifest templates and static native graphic placement. The anchor
remains the transform pivot; it no longer subtracts half a default layer's size
from its position. This does not establish custom-pivot, clipping or arbitrary
transform parity.

Private graphic masks use sRGB luminance multiplied by their original alpha.
The old export conversion discarded source transparency; the preview ignored
these masks. Preview loads now participate in the shared readiness clock,
unavailable masks fail visibly, and retry does not discard the composition.
The mask remains throughout the graphic, with custom transitions fading it in
or out. Conflicting mask IDs and unsupported media/animation masks fail explicitly
before native compilation instead of being silently dropped.

## Evidence and limits

- Four unit tests cover alpha, colored luminance, disabled and conflicting masks,
  and unsupported layer kinds. Initial root qualification passed 607 tests,
  types/build/bundle checks and the Worker dry-run before the origin correction.
- Four focused browser tests passed across mobile and desktop Chromium after
  the origin correction, with real private uploads, delayed loading, failure and
  retry, native exports and a second account denied access to the mask (403).
- The fixture covers eight opaque/transparent/color bands at frame 6, plus frame
  18 after a custom transition. Preview RGB must stay within five channel values
  of the expected composition; decoded H.264 export must stay within six of
  preview. This is sampled, lossy-codec evidence, not whole-frame pixel identity.
- The initial fixture was rejected by the existing 240-pixel minimum dimension.
  Fixing the fixture exposed a second failure: preview placement differed by
  half a layer. The implementation was corrected; assertions were not relaxed.
  Failed screenshots remain in the worktree's ignored test-results directories.
- Final combined root qualification passed all **607 tests**, type checking,
  production build, bundle budgets and the Worker dry-run (no deployment).
- Expanded local qualification passed **34 browser tests in 8.1 minutes**, without
  retries: both Chromium projects cover native text layout, actual media/font/
  Lottie/Rive buffering, media recovery, post-gain sound, masks, numeric native
  progress and the complete programmable-cinema lifecycle. Logs are
  `B:/CreativesOS-task-artifacts/cut-private-mask-expanded-v2.log` and its error
  companion. Synthetic evidence was explicitly retained; no database or upload
  store was retained. The earlier expanded invocation failed before tests because
  cmd.exe interpreted a grep pipe; invoking the installed Playwright CLI directly
  corrects argument handling without changing the test selection or assertions.
- A focused repeat writes successful mask comparison PNGs explicitly for visual
  inspection; body attachments alone are not retained by the local line reporter.
  All four repeated tests passed in 1.8 minutes. Desktop static preview/export
  images were visually inspected; colored/transparent bands and positions agree
  at their different output sizes. Retained directory:
  `test-results/creativesos-browser-qualification-23f270f235074fa78db62000c52b9873`.
  Protected merge and production deployment still require separate receipts.

Compound blur/glow/filter order, mask edge resampling/color-profile differences,
video/animation masks, general transformed clipping and other browsers remain
outside this qualification. Browser evidence retention can now be explicitly
requested without retaining the disposable database or private upload store.

Reference: [CSS Masking luminance semantics](https://www.w3.org/TR/css-masking-1/#MaskValues).
