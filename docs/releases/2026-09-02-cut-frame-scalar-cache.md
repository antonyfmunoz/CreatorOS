# Frame-uniform native color and opacity cache

The native graph previously reevaluated compiler-generated brightness,
saturation and opacity curves for each output pixel. The new explicit internal
`frameUniform` option caches only those scalars per frame and per geq slice.
Pixel samples, alpha samples, effect ordering and rounding are unchanged.
Generic helper callers retain uncached semantics unless they opt in; the public
application never accepts FFmpeg expressions. The production caller opts in
only for the existing declarative curve compiler and legacy time-keyframe path.

Registers 0/1 remain curve scratch, 2/3 hold scalar values, 4–6 remain pixel
scratch, and 7 holds N+1 so zero-initialized expression state cannot accidentally
reuse a value on frame zero. Each channel and slice has independent state.
References: [geq frame and slice state](https://ffmpeg.org/ffmpeg-filters.html#geq)
and [AVExpr storage](https://ffmpeg.org/ffmpeg-utils.html#Expression-Evaluation).

Fourteen focused unit checks passed. Three raw tests passed in 33 seconds:
24/30/60 fps, one/two/four filter threads, baseline and cached execution, mixed
curves including spring/step/easing and enter/exit fades, all 256 alpha values,
dynamic brightness-only and saturation-matrix paths, and non-neutral contrast.
All decoded RGBA bytes matched the uncached baseline, including first/last
frames. Each fixture also requires more than half its frames to differ, so a
constant output cannot accidentally satisfy equivalence. The original first
test collection attempt failed on a missing object delimiter before rendering;
the syntax was corrected and all three tests rerun successfully.

Receipts are in `native-frame-scalars-20260902201140240` in the owned task
artifact directory. Measured timings are mixed, particularly at 60 fps: this
fixture establishes exactness, not a blanket performance win. A representative
full browser/render repeat, full root and protected qualification are still
required before integration. No deadline, resolution, frame count, quality
setting or admission capacity was lowered. This does not establish Remotion
parity or a production deployment.

Combined source `8e27be2880154453bace27c222a208d20b5b0aae` passed the full root:
664 unit tests across 158 files, type checks, build, bundle budgets and Worker
dry-run. Its 16-case native/mobile/desktop browser suite passed in 5.2 minutes,
with no retries or relaxed bounds. It includes both complete cinema workflows,
actual preview/export base and ordered colors, raw color/alpha, filter-pool and
all three frame-rate cache comparisons. Evidence:
`creativesos-browser-qualification-45778054c61c456b9a5343fda1778a51`,
`cut-scalars-root-20260902T131933.log` and `cut-scalars-browser-20260902T131933.log`.
The previous filter-pool-only failures remain retained. Exact protected source
and normal-user production proof remain required; no broad speed superiority is
inferred from this single full-workflow pass.
