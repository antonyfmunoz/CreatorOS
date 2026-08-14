# CreativesOS v299 connected creation loop

Release candidate prepared: 2026-08-13

## Outcome

The provider-independent creation loop is now one continuous, field-tested
workflow rather than a collection of adjacent screens:

`Broadcast -> CutStudio -> Distribution -> native post -> comment automation -> DM -> performance`

## Product changes

- Broadcast recording lineage is retained through the CutStudio project and
  rendered public asset.
- A completed render opens Distribution Studio with the correct asset, format,
  suggested copy, source project and render already selected.
- Published queue entries provide direct actions back to the source edit, the
  public post, post-scoped comment automation and performance analytics.
- Native comment and DM events now kick a serialized automation processor
  immediately; the five-second scheduler remains the durable recovery path.
- Local qualification can promote private generated media without weakening the
  production requirement for private R2 storage.
- Asset quotas are enforced per media kind, with production-appropriate video,
  download, LUT and general-library budgets instead of one shared counter.
- Broadcast studio URLs identify the exact production, overlapping loads cannot
  replace a newer selection, and deleting a studio returns the operator to the
  most recently used surviving studio.
- CutStudio keeps autosave state separate from edit confirmations and exposes
  keyboard-accessible snapped clip movement and linked ripple trimming.

## Qualification evidence

- All 70 test files and 268 tests pass, followed by type checking, the production
  build, bundle budgets and the distribution-worker dry run.
- The disposable PostgreSQL migration harness applies all 79 migrations and
  validates the required schema.
- The same generated-media golden journey passes in Pixel 7 and desktop Chrome
  projects, including a second-user keyword comment, automated public reply,
  automated DM and post analytics.
- The entire application browser matrix passes after one sustained run; the
  complete CutStudio matrix independently passes all 22 mobile/desktop cases.
- Backup/restore, secret scanning and capacity qualification pass. The capacity
  probe completed 200 requests at concurrency 20 with zero failures, about
  211 requests per second and 208 ms p95 latency on the qualification machine.

## External boundaries

No external social or streaming provider is implied by this release. Live
destinations, external-channel messages, provider transcription, model-backed
assistance and cloned voice retain their explicit provider gates.
