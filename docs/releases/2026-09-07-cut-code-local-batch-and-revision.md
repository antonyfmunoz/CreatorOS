# CutStudio local code batches and source revisions

Status: locally qualified release candidate; not deployed

## Product change

- A sandboxed TSX composition can accept a bounded batch of 2–20 distinct
  private composition-input objects. Each item becomes its own durable,
  idempotent, independently cancellable `code_render` job. A paired device
  still owns at most one active lease, so a batch cannot multiply the authority
  or resource budget of a local workstation.
- Batch admission serializes per owner and counts all queued/running CutStudio
  work. It rejects a batch that would exceed 20 active jobs, replays an exact
  idempotent submission, and rejects a reused key whose request differs.
- An existing sandboxed composition can now be selected for revision. The
  author opens its private source package, saves a new matching ZIP/lockfile
  pair, and updates the same composition with an optimistic `If-Match`
  revision. Older completed outputs remain immutable receipts of their pinned
  source and are not overwritten.
- A code capsule may declare a small value-only input contract. Required text,
  finite numeric and boolean fields, explicit defaults, numeric/string bounds,
  finite option sets and Unicode-safe patterns are normalized in both the
  browser and server before a job is durable. Unknown fields never reach the
  untrusted package. The supplied motion and 3D starters demonstrate the same
  TypeScript `useInputs<T>()` shape and saved contract.
- A running local render now has a cooperative cancellation path: the server
  preserves the device lease until the next short heartbeat, the CLI aborts the
  isolated container, temporary private output is removed, and the durable job
  becomes cancelled. A late completion cannot overwrite that terminal state.

## Verification completed locally

- `npm test -- tests/cut-code-render-request.test.ts
  tests/cut-code-render-queue-contract.test.ts
  tests/cut-code-authoring.test.ts` — 27 passing assertions for bounded
  requests/batches, queue contract, source authoring and revision handling.
- `npm run check` — TypeScript passes.
- `npm --prefix runtimes/cut-code test` — the full clean-room runtime suite,
  including typed SDK authoring, passes.
- `npm run build` — browser and server production bundle completes.
- `npm --prefix runtimes/cut-code run qualify` — completed on 2026-09-08 UTC
  against isolated image
  `sha256:631240f38c97866e56d66b8f49927ea3423d609ddf61ab7849379c9b6d55d812`
  and wrote a fresh `qualification-output/receipt.json` with 86 records.
  It exercised actual deterministic PNG-sequence replay, private source/CSS
  imports, 3D vector composition, still/video/alpha/video-layer/audio output,
  codec variants, network/metadata denial, deadline cancellation and container
  cleanup. The only two receipt entries without artifacts are intentional
  failure/cancellation assertions, not missing output.
- Earlier in this workstream, the signed-in `antonyfm` account completed a real
  private local frame-sequence job on its paired Windows node. That exercise
  proved source packaging, private delivery, container execution and sealed
  output for the pre-existing production path; it does **not** prove these
  newer commits in production.

## Remaining release proof

This candidate needs a protected deployment with the production database
credential, followed by authenticated browser tests that submit a distinct
two-item batch, revise its source, execute one claimed job, cancel a running
job, and preserve/open both old and new private output receipts. Until that
evidence exists, do not claim deployed batch/revision/cancellation parity.
