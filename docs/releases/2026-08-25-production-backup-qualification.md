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
  readability and required-table inventory;
- fails closed when the newest completed archive is invalid, materially in the
  future or older than the published 30-hour recovery-point threshold; and
- retains secret-free release and backup evidence for 90 days.

## Production evidence

GitHub Actions run
[`32897368705`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32897368705)
passed against exact verified live commit
`54b7e1faac5464fd0a0395beba2e9cc8453b25e8`. It verified private backup
`a0d53d2d-1fb0-461c-bdea-3b8a60744bfa` at 1,136,997 bytes, matched the durable
size and SHA-256 manifest, proved the archive readable with all 13 required
archive-table families, and measured its age at 73,437 seconds against the
enforced 108,000-second ceiling.

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
checksum-consistent, readable and within the published recovery-point target.
The later protected production restore run `32897371297` restored the same
archive in an isolated private Machine, independently enforced its age, applied
its one pending migration to reach exact live-release parity, measured an
18-second RTO and destroyed the Machine. Paid regional failure and
representative production volume remain separate scale evidence.
