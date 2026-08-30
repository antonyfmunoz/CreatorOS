# CutStudio sampled graphic filters

Date: 2026-08-30

## Outcome

Normal-user text and vector graphics now retain sampled blur, brightness and
saturation in the final private MP4. These properties no longer stop at the
browser preview.

## Architecture and safety

- The deterministic composition evaluator samples the three bounded filter
  properties into EDL v3 with backwards-compatible defaults.
- Blur is applied as at most twelve time-bounded Gaussian segments. Brightness
  and saturation use frame-evaluated FFmpeg expressions tied to the graphic's
  authored timeline.
- Values remain schema-bounded. Users cannot submit filter names, expressions,
  commands, paths, URLs or executable source.

## Qualification contract

- Unit coverage proves all three sampled properties survive compilation.
- The mobile and desktop journey authors the keyframes through normal controls,
  renders the actual private artifact, and proves the card is darker and less
  saturated while its motion and 3D row-profile checks remain green.
- Full repository verification, secret scan, protected CI, exact release
  identity and production smoke remain mandatory.

## Remaining boundary

Animated 3D/flip, geometric masks, drop shadow/glow and the remaining stylized
effects, sanitized general SVG and image/font/Lottie/Rive/Three final rendering
remain separate work.
