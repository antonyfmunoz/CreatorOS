# CutStudio player, render batches, and code-package release candidate

Status: locally field-qualified release candidate

## Product change

- Parameterized composition variants can be created and independently rendered
  as one idempotent batch. Every job owns an immutable manifest snapshot and
  records composition, revision, batch, variant and artifact lineage.
- CutStudio exports a reusable frame-accurate composition player with play,
  pause, seek, restart, loop and playback-rate behavior. A private revisioned
  API returns only the composition and exact assets the authorized player needs.
- Code compositions may be packaged before an execution provider is activated.
  The package binds a private ZIP, an exact npm/pnpm/Yarn lockfile, entrypoint,
  deny-network policy, and bounded CPU, memory and output budgets.

## Safety boundary

The web process never executes uploaded composition code. Source-package
inspection rejects path traversal, absolute and duplicate paths, symlinks,
encrypted entries, unsupported compression, expansion bombs, missing root
`package.json`, missing entrypoints and malformed lockfiles. Isolated execution
remains an explicit external activation and production-qualification gate.

## Local evidence

- TypeScript and 73 focused schema, migration, asset-policy, composition and
  archive-security tests pass.
- Fresh migration qualification passes 120 ordered migrations through
  `0119_cut_studio_code_capsules.sql`.
- Desktop Chromium creates a private code package without a configured
  executor, plays and pauses a real composition, validates the revisioned
  player API and cross-tenant denial, creates parameterized variants, proves an
  idempotent two-job render batch, waits for both FFmpeg jobs, and opens both
  private media artifacts.

Protected CI, the exact production release, live player behavior, and live
multi-artifact output remain required before this candidate is called shipped.
