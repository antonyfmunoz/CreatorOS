# Integrated native graphics qualification

Local source checkpoint: `6a44594`, following `20fa119` and `35a1f26`.
This candidate combines private image crop/fit/stretch, archive byte validation,
the Express-4-compatible qs security override, authored 2D graphic pivots and
off-frame clipping, motion-boundary preservation, transparent SVG/primitive fit
gutters, and exact-alpha work reduction. It does not expose executable capsules.

## Actual local evidence

- Root `cut-parity-integrated-verify-v5.log`: 632 tests in 153 files, TypeScript,
  production build, bundle budgets and Worker type/dry-run checks passed.
- `cut-parity-motion-opacity-browser.log`: eight actual browser/native journeys
  passed across mobile and desktop (twenty motion controls/step holds, complete
  programmable cinema lifecycle, unoccluded private-font title motion, transparent
  vector/primitive gutters). Existing render and workflow deadlines were unchanged.
- Two newly added raw-alpha cases in that first run were deliberately interrupted:
  per-byte Playwright assertions created excessive synchronous trace overhead.
  These are recorded as failures, not passes. The revised loop checks every byte
  while reporting aggregate errors; exact equality and zero color-error requirements
  are unchanged. `cut-parity-opacity-byte-browser.log` then passed both cases in
  25.2 seconds. Each case tests seven envelopes, six frames, all 256 alpha values,
  exact raw-RGBA equality with the former filter and independent numeric checks.
- Retained owned browser outputs:
  `B:/CreatorOS-cut-parity-integrated/test-results/creativesos-browser-qualification-e118e365f0f24f96a3cc6e05aa0ae33d`.
  The separate opacity log records its additional retained evidence directory.
- Earlier image/geometry and archive qualification receipts remain linked in their
  individual release notes; later protected CI must test the full combined source.

The title travel/growth/rotation measurement now has its own actual-export journey.
All five original numeric assertions are preserved. Whole-frame blue bounds in the
full cinema scene could not distinguish the title from overlapping glow/other
blue graphics and occluding layers; retained opening/settled images reproduced
that problem. The full cinema journey retains its other composited-pixel,
workflow, archive-admission, batch and persistence checks.

## Boundaries

Protected checks, merge and deployment are pending at this source checkpoint.
The Google management sign-in gate remains. Native spring/nonlinear curves still
use sparse interpolation in this candidate; a separate follow-up is required.
This is not full Remotion parity, public executable TSX, general 3D/HDR/codec,
concurrent performance or production proof.
