# Production backup qualification

Date: 2026-08-25

## Outcome

CreativesOS now has a protected, repeatable production-backup qualification
workflow. It runs weekly after the scheduled daily backup and can also be
dispatched on demand with an optional exact deployed commit requirement.

The workflow:

- proves the public release boundary is verified, clean and migration-complete;
- uses the existing protected Fly deployment token rather than copying database
  or R2 credentials into GitHub Actions;
- runs the deployed `inspect-production-backup.mjs` inside the production Fly
  machine;
- validates the newest private archive's durable size, SHA-256 manifest,
  readability and required-table inventory; and
- retains secret-free release and backup evidence for 90 days.

## Qualification

- 119 Vitest files and 458 tests pass.
- TypeScript, production build, bundle budget and Worker dry-run pass.
- Source-secret scan passes across 894 files.
- Disposable backup and restore qualification passes with 108 migrations,
  25 critical tables and zero orphan direct messages.
- Mixed-capacity qualification completes 1,600 requests at concurrency 32 with
  zero failures.
- The readiness soak completes 9,739 requests with zero failures and proves
  process replacement, readiness recovery and durable authenticated writes.

## Evidence boundary

This workflow proves that the newest real production archive is privately held,
checksum-consistent and readable. The later protected production restore run
`32889621581` restored the same archive in an isolated private Machine, applied
its one pending migration to reach exact live-release parity, measured an
18-second RTO and destroyed the Machine. Paid regional failure and
representative production volume remain separate scale evidence.
