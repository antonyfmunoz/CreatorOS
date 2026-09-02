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

This changes only the base graphic controls. The separate `color_matrix` effect,
ordering and composition of other effects, browser/codec color profiles, HDR,
3D and general timeline preview still require their own parity work. A small
channel test does not establish production performance or Remotion parity.

References: [CSS filter functions and sRGB](https://www.w3.org/TR/filter-effects-1/#color-interpolation-filters),
[brightness](https://www.w3.org/TR/filter-effects-1/#brightnessEquivalent),
[saturation matrix](https://www.w3.org/TR/filter-effects-1/#feColorMatrixElement),
[native expression filters](https://ffmpeg.org/ffmpeg-filters.html#geq).
