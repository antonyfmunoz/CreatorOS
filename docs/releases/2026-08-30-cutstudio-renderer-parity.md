# CutStudio declarative renderer parity release candidate

Date: 2026-08-30

## Outcome

- Replaces vector, path and data placeholders with deterministic visual output.
- Parses SVG in the browser and recreates only allowlisted primitive elements
  and attributes; scripts, event handlers, external URLs and raw markup
  execution are excluded.
- Evaluates and previews perspective, X/Y rotation, blend modes, animated blur,
  brightness and saturation, flip transforms, and geometric wipe, iris and
  clock reveals at an exact frame.
- Gives creators bounded controls for perspective, X/Y rotation and effect
  amount while retaining the revisioned manifest as the source of truth.
- Adds bounded preview treatments for blur, motion blur, glow, shadow, color,
  vignette, grain/noise and light-leak effects.

## Local evidence

- TypeScript passes.
- The focused programmable-runtime unit suite passes 11 tests.
- Mobile and desktop browser journeys pass against a disposable database with
  all 115 migrations.
- The journeys prove 3D/effect preview, path rendering, durable persistence,
  cross-business private-asset denial and reviewer mutation denial.

## Honest boundary

This slice improves browser rendering. Complete final-render parity, native
Lottie/Rive/Three playback, executable code isolation, parameterized batch
variants and external model execution remain separate work. Protected CI,
merge, deployment and exact-production smoke remain required before this
candidate is production-qualified.
