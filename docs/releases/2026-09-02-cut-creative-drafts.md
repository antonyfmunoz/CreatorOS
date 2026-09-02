# CutStudio creative-draft custody

## Protected merge receipt

PR [149](https://github.com/antonyfmunoz/CreatorOS/pull/149) merged at
`2026-09-02T13:34:41Z` as
`970dec3d6d873e1d5503dcea5fbe93c9e90a9568`. Exact reviewed head
`043dac73f90ad0438755b1fe08825e6aacd4c2d2` passed Verify
[33633729064](https://github.com/antonyfmunoz/CreatorOS/actions/runs/33633729064)
(276 browser journeys passed, 24 intentionally skipped, plus core/database/native
shell checks) and CodeQL
[33633729281](https://github.com/antonyfmunoz/CreatorOS/actions/runs/33633729281).
No protection or retry setting changed. A merge is not a deployment: the public
readiness receipt still identifies source `7785912c74404b653ed64faba1ebe45b7b5a4fb8`;
Google management reauthentication remains required for coordinated promotion.

## Implemented scope

Composition manifests, generation workflow graphs and production briefs now keep
independent in-memory edits. A refresh or another item's successful save no longer
replaces those edits. Apply/variant actions require that composition to be saved.
Save acknowledgements preserve a newer edit, including an undo made while the
response is in flight, and advance only that item's acknowledged revision.
An interrupted or failed acknowledgement is not treated as proof that the
server failed to commit; the draft remains protected even after an undo.

External revisions/deletions retain the draft and its original conflict guard.
Returning a draft to its old value after an external change does not silently
replace it with the remote value. Explicit, confirmed discard uses the latest
loaded saved version. Existing Projects/link/unload guards now include creative
drafts and pending operations. Component lifetime and project identity guards
prevent late old-project callbacks from applying to another project.

Field testing also found and fixed three concrete authoring defects: short
motion starters could place keyframes beyond their graphic layer; the workflow
canvas could widen the whole mobile page; and a remounted Objective textarea
had an unstable accessible name. Timing is layer-relative, the side panel can
shrink independently of its scrollable canvas, and the brief label is explicit.
Creative section tabs remain below the sticky project header.

## Local evidence

- Ten desktop/mobile database-backed browser journeys passed on the final
  candidate: independent saves/refreshes, blocked navigation and confirmed
  discard, delayed acknowledgements with intervening undo, actual revision
  conflicts, brief creation/update with intervening edits and reload, and an
  actual server commit followed by a deliberately lost network response.
- The journeys create private synthetic media and actual records in a disposable
  database after all 120 migrations. They do not use production user records.
- Unit coverage exercises generic draft transitions and validates all three
  starter templates against the actual manifest schema, across short and longer
  durations and video/audio input types.
- `npm run verify` passed: 595 tests in 145 files, TypeScript, client/server
  production build, bundle budgets, Worker types and local deployment dry-run.
- Source secret scan passed for 1120 tracked source files before staging.
- Initial failures were retained and fixed; no forced clicks, enlarged timeouts,
  skipped assertions or changed protected gates were used.

Artifacts: `B:\CreativesOS-task-artifacts\creative-drafts-browser-unconfirmed.log`.
Protected CI and production are separate gates; their results must be attached
to the exact candidate before protected release/public capability claims.

## Boundaries

This is not crash/offline recovery, durable local storage, browser Back/history
interception, collaborative conflict merging or unsent new-shot/code-form custody.
Template schema validity does not prove subsecond source-media render fidelity.
No executable TSX service, provider activation or production deployment is enabled
by this change. Actual public field qualification remains required.
