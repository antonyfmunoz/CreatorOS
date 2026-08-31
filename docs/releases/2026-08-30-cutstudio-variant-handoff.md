# CutStudio generated-variant review handoff release candidate

CutStudio now owns the provider-independent half of the cinematic result loop:
a ready private project video can enter durable shot review, receive an explicit
decision, and continue into the existing non-destructive timeline without an
export or re-upload.

## Product behavior

- Editors can add an existing project video as a shot candidate without
  pretending that CreativesOS generated it.
- Candidate records retain the private asset, shot, business, importer and
  project-media lineage used by future provider callbacks.
- Editors can select, reject and supersede candidates. The selected state is
  consistent between the shot and its variant record.
- A selected video appends to the primary EDL v3 timeline with stable
  `sourceVariantId` and nullable `generationJobId` lineage.
- A repeated handoff returns the existing clip instead of duplicating media.
- The authenticated UI previews candidates through the existing private
  project-media stream and exposes the review and timeline controls inline.

## Enforcement

- Only owner/editor roles may import candidates, decide them or mutate the
  timeline; reviewers remain read-only.
- The asset must already be ready private video owned by the project tenant and
  associated with that exact project.
- Project revision preconditions protect the timeline handoff from concurrent
  edits.
- Cross-tenant and unassociated assets fail closed.
- Projection events preserve imported, selected, rejected and handed-off
  transitions without exposing private media URLs.

## Qualification

- Fresh authenticated mobile and desktop journeys import and preview real
  private video, select it, perform a direct timeline handoff, prove persisted
  lineage, repeat the handoff without duplication and deny a foreign asset.
- Full repository, security and protected-release gates remain required before
  this candidate is promoted beyond local proof.

Provider callback ingest, native Lottie/Rive/Three rendering, isolated code and
model execution, and locked human parity benchmarks remain separate gates.
