# CutStudio bounded nested source-time trims

**Status:** local source candidate. This record is not a deployment, normal-user
field receipt, or a competitive-parity claim.

## Scope

Nested declarative composition containers now support an exact source-time
window of their referenced composition. Expansion keeps child layers native:
media starts at the corresponding private source frame, visible child layers
are clipped to the same parent window, and numerical keyframes are rebased to
their already-authored in-progress value rather than restarted at frame zero.

The implementation deliberately refuses a trim that cuts through a child enter
or exit transition. Recreating the remainder as a new transition would change
the authored image and make preview/export agreement a guess. It also rejects
source windows outside the child composition and non-numeric animation values.

## Local evidence

- `tests/cut-studio-production.test.ts` covers private-media source offsets,
  graphics timing, a keyframed child value sampled mid-animation, invalid
  source windows, and transition-splitting rejection.
- Related composition/preview tests pass locally. The exact branch must still
  pass protected CI, production deployment identity, and an authenticated
  output/recovery field run before it advances beyond local evidence.

## Still open

Composition-group transforms, arbitrary child-transition slicing, cross-canvas
resampling, public executable TSX dispatch, scale/cost evidence, and the
authorized same-input Remotion benchmark remain outside this bounded change.
