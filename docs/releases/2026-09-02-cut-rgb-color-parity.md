# Native graphic brightness and saturation

The preview uses CSS `brightness()` and `saturate()`. Native export previously
used FFmpeg's YUV `eq` brightness offset (`brightness - 1`) and saturation. Those
are not equivalent color operations, even when the authored scalar values agree.

The candidate evaluates base graphic brightness as an sRGB channel multiplier,
then the CSS saturation matrix. It clamps function outputs and preserves source
alpha. Neutral colors skip adjustment; constant brightness uses a channel lookup
table; animated brightness/saturation use compiler-generated frame expressions.
No public arbitrary filter text or executable-code capability is introduced.

## Evidence boundary

- Four focused compilation tests passed.
- A native 16-by-16, six-frame raw RGBA test passed twelve control combinations,
  including animated brightness/saturation, high multipliers and all 256 alpha
  values. It independently compares all RGB bytes with channel equations (at
  most one unit for floating-point/byte quantization) and requires exact alpha.
  Receipt: `B:/CreativesOS-task-artifacts/native-rgb-20260902`.
- The app-level fixture uses authored brightness/saturation keyframes (not
  unsupported top-level fields), actual saved/applied private compositions,
  browser preview and one downloaded MP4. It compares static, translucent and
  animated color cards at four frames. This fixture, full root, protected CI and
  deployment are pending at this checkpoint.

## Field result and bounded constant-color optimization

The initial complete root run passed 648 tests, type checks, build, budgets and
Worker dry-run. The following browser run passed nine checks and failed one:
both devices passed the actual saved color-card comparisons, with maximum
observed mobile RGB channel error three across 32 measurements. Mobile cinema
exhausted its existing 180-second workflow deadline. The trace shows the primary
render completing in 47.2 seconds and its two-render batch in 92.6 seconds;
failure occurred near the final portrait-player check, not a color assertion.
The failed run remains retained at
`B:/CreatorOS-cut-color-parity/test-results/creativesos-browser-qualification-6d5a97885b4f415a8cb6d124d4f092d6`.

Constant supported saturation now uses the native RGB matrix operation rather
than evaluating the same matrix expression independently for every pixel.
Brightness and matrix calculations retain a 16-bit RGB intermediate, with the
original 8-bit alpha extracted and reattached unchanged. Out-of-range native
matrix coefficients and animated controls retain the general expression path;
controls are never silently clamped to the faster filter's smaller range.

- The first 8-bit fast-path attempt failed the existing one-level RGB tolerance
  with error two. A direct 16-bit RGBA round-trip then failed exact alpha by one.
  Neither tolerance was relaxed. Separate alpha preservation passed all thirteen
  raw control combinations. The focused compilation suite now passes five tests.
- An owned 720p/30 fps/two-second filter-cost study retained both failures and
  completions. The old calculation hit the unchanged 30-second deadline after
  41 and 46 frames. The optimized path completed all 60 frames in 893 and 1557 ms.
  This is not a complete baseline timing, identical-hash claim, production load
  measurement or competitor benchmark. Its independent RGB/alpha bounds remain
  required. Receipt:
  `B:/CreativesOS-task-artifacts/cut-native-color-study-Qnolt0/receipt.json`.
- The follow-up also incorporates the supported FFmpeg filter-file option from
  the integrated candidate. Revised full root/browser and protected CI remain
  pending before merge or deployment.

This changes only the base graphic controls. The separate `color_matrix` effect,
ordering and composition of other effects, browser/codec color profiles, HDR,
3D and general timeline preview still require their own parity work. A small
channel test does not establish production performance or Remotion parity.

References: [CSS filter functions and sRGB](https://www.w3.org/TR/filter-effects-1/#color-interpolation-filters),
[brightness](https://www.w3.org/TR/filter-effects-1/#brightnessEquivalent),
[saturation matrix](https://www.w3.org/TR/filter-effects-1/#feColorMatrixElement),
[native expression filters](https://ffmpeg.org/ffmpeg-filters.html#geq).
