# Native color-effect ordering candidate

The composition preview applies base brightness/saturation and then all enabled
color effects in authored order. Native export previously selected only the first
`color_matrix` effect, used YUV additive brightness, and applied extra amount-based
contrast/saturation multipliers before the base controls. Those are different
operations; scalar motion correctness does not establish color-effect fidelity.

This candidate shares existing declarative defaults with the preview, implements
sRGB midpoint contrast before brightness/saturation, and retains every enabled
color effect in order after the base controls. Contrast uses the RGB lookup or
16-bit matrix path where possible and retains alpha independently. Inputs above
the native helper's supported zero-to-eight multiplier range fail explicitly;
this does not establish arbitrary-range filter support. No user-authored native
filter text is accepted.

Qualification adds raw RGBA cases for contrast, combined and animated controls,
and actual saved composition preview/export cases with repeated/reversed color
effects, disabled effects, legacy amount defaults and translucent cards. Existing
one-byte raw RGB, exact alpha, two-byte preview-oracle and four-byte encoded
preview/export tolerances are unchanged. Full execution is pending.

Scope is color-only stacks. Ordering relative to spatial/overlay effects, blur,
shadows, glow, noise, chroma key, projected 3D, HDR and production behavior remain
open. This is not a Remotion parity claim.

References: [CSS contrast definition](https://www.w3.org/TR/filter-effects-1/#contrastEquivalent),
[FFmpeg RGB lookup filters](https://ffmpeg.org/ffmpeg-filters.html#lut_002c-lutrgb_002c-lutyuv).
