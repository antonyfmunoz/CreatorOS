# CutStudio composition motion rendering release candidate

Date: 2026-08-30

## Outcome

- Carries bounded title motion samples from the same deterministic composition
  evaluator used by browser preview into EDL v3.
- Validates unique, in-range graphic motion keyframes.
- Compiles title X, Y and opacity into time-bounded FFmpeg expressions rather
  than flattening an animated composition to one static title.
- Caps evaluator samples to keep the render graph bounded and avoid unsafe or
  pathological filter-expression growth.

## Local evidence

- TypeScript and focused CutStudio suites pass.
- A fresh-migration browser journey creates the composition through the normal
  authoring UI, applies it, renders a private 720p MP4 and samples two complete
  decoded frames.
- The frame evidence finds the branded title region and proves its X position
  changes by more than 120 output pixels during the authored slide.

## Honest boundary

This release candidate closes final-render position and text-opacity motion.
It does not yet claim final-render scale, rotation, vector/path, 3D,
geometric-transition, advanced-effect, Lottie or Rive parity. Protected CI,
merge, deployment and exact-production smoke remain required.
