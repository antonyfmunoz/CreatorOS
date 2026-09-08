# CutStudio bounded nested-composition candidate

**Status:** local source candidate. Not deployed, field-proven, or a Remotion
parity claim.

## Scope

Declarative CutStudio compositions can now embed another active declarative
composition from the same project. Expansion is bounded to four levels and
rejects missing references, cycles, differing width/height/frame-rate, font
family conflicts, non-neutral composition containers, and partial or offset
child playback. Those restrictions prevent a preview/export mismatch while
group transforms and arbitrary sub-composition retiming remain outside this
candidate's declared scope.

Child parameters resolve into the expanded render graph. Preview, timeline
apply, private composition-media authorization, and queued render batches all
use that same expansion. Render jobs persist the fully expanded manifest, so a
later edit or archival of a child cannot alter a queued export. Referenced media
is revalidated as ready, private, business-owned project media before use.

## Local qualification

- `tests/cut-studio-production.test.ts` proves same-project child resolution,
  timing offset, private video asset lineage, typed parent-to-child parameter
  binding, invalid canvas rejection, cycle rejection, and neutral-container
  enforcement.
- `tests/cut-motion-control-points.test.ts` remains green, including its
  single-validation compilation guard.
- Focused TypeScript checking passed. The exact-head protected build remains a
  required release gate.
- The existing animation renderer qualification produced visible Lottie and
  Rive frames; the native lifecycle qualification passed private process exit,
  stalled-owner reaping, concurrent-owner isolation, and forced cleanup.

## Still open

This is not decoded production output or a normal-user recovery field receipt.
It does not provide arbitrary nested group transforms, resampling across canvas
formats, public executable TSX rendering, managed compute, broad dependency
compatibility, scale/cost proof, or an authorized same-input Remotion benchmark.
Those evidence gates remain required by the CutStudio competitive rubric.
