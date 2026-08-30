# CutStudio stylized-effects release candidate

Date: 2026-08-30

## Outcome

- Carries the enabled, ordered composition effect stack through the canonical
  compiler into EDL v3 instead of treating effects as preview-only metadata.
- Renders bounded blur, shadow, glow, grain, noise, vignette, color-matrix,
  chroma-key, displacement, motion-blur and light-leak treatments in the final
  private H.264 output.
- Applies private, owner-scoped image masks to final graphics and rejects
  missing, foreign, non-image, non-ready, and conflicting mask references.
- Gives normal users effect-stack authoring, enable/disable, amount editing and
  private mask selection without exposing executable filter syntax.
- Preserves deterministic limits: 20 final effects per graphic, 20 scalar
  parameters per EDL effect, bounded values, allowlisted effect families and no
  user-provided SVG filters or FFmpeg expressions.

## Evidence

- The focused CutStudio schemas/compiler suite passes 45 tests.
- TypeScript passes.
- Fresh authenticated mobile and desktop journeys each apply the complete
  effect family, persist and reload the ordered stacks, render a real private
  MP4, and prove geometric reveals, masks and styled layers from decoded pixel
  samples.
- Both journeys run against a disposable database with all 116 migrations and
  retain reviewer denial and cross-tenant private-asset rejection.

## Honest boundary

This candidate is locally qualified, not production-qualified, until its
protected stacked release reaches `main`, the exact commit is deployed, and an
independent all-scope production smoke passes. Private font assets, native
Lottie/Rive/Three playback and final rendering, isolated executable
compositions, approved generative-model execution and locked direct human
benchmarks remain separate work. No equal-or-better competitor claim is made
from synthetic fixtures or local tests.
