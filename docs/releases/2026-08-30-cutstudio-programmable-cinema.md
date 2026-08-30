# CutStudio programmable cinema release

Date: 2026-08-30

## Release scope

This release adds the first production-grade, provider-independent vertical
slice of the expanded CutStudio design:

- clean-room programmable composition contracts, typed parameters, layers,
  keyframes, transitions, effects, fonts, data bindings and bounded code
  capsules;
- a shared deterministic frame evaluator, safe media/text EDL compiler and
  native frame scrubber;
- editable kinetic-title, lower-third and product-motion starters;
- production briefs, continuity elements, cinematic shot/camera controls,
  rights, likeness-consent and synthetic-media disclosure gates;
- provider-neutral model capabilities, durable generation requests,
  idempotency, retry/cancel state, variants and artifact provenance;
- a persisted visual workflow graph with typed connections, prompt editing and
  finishing-stage authoring;
- tenant/project authorization, optimistic revisions, private-ready asset
  enforcement, explicit provider-pending states and projection events; and
- migration `0114_cut_studio_programmable_cinema.sql` plus empty-database
  qualification coverage.

## Local qualification receipt

- `npm run verify`: 125 test files and 502 tests passed; TypeScript, production
  build, bundle budgets and Worker type/dry-run checks passed.
- Migration qualification: 115 migrations, 240 required tables and 205
  required columns passed from an isolated database.
- Mobile Chromium: the full programmable composition, scrubber, brief, shot,
  rights, generation staging, visual workflow edit and persistence journey
  passed.
- Desktop Chromium: the same journey passed.
- Both viewports proved outsider read denial, reviewer mutation denial and
  rejection of a different business's private asset in generation and workflow
  update paths.
- `npm run verify:secrets`: clean.

These are local implementation and field receipts. Protected CI, production
migration, deployed release identity and production smoke are recorded only
after the branch is merged and the protected deployment workflow passes.

## Deliberately unclaimed

This release does not claim complete Remotion or Higgsfield substitution
parity. Full advanced-layer rendering, general node/edge/layer authoring, an
isolated executable-code worker, approved model adapters, scalable render/GPU
capacity and locked same-brief competitive benchmarks remain explicit gates in
`CUT_STUDIO_PROGRAMMABLE_CINEMA_STANDARD.md`.
