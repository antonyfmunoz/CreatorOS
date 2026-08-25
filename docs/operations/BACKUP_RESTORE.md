# CreativesOS backup and restore runbook

## Backup

Production automatically requests one idempotent backup at 09:17 UTC each day.
The Cloudflare scheduler calls the authenticated internal backup endpoint, the
application creates a compressed PostgreSQL custom archive, and stores the
archive plus a SHA-256 manifest in the private production R2 bucket. Every run
has a durable `production_backups` record. Failed runs may be retried; concurrent
or duplicate successful runs for the same UTC date do not create extra copies.

Use `scripts/trigger-production-backup.mjs` inside a production machine for a
safe operator-triggered run. Use `scripts/inspect-production-backup.mjs` to
download the newest private archive to an access-restricted temporary file,
verify its database and manifest hashes, and prove `pg_restore` can read the
required archive tables. The temporary file is removed whether verification
succeeds or fails.

For an operator-created off-platform copy:

1. Load the production `DATABASE_URL` through the approved secret manager.
2. Choose a dedicated encrypted backup directory outside the repository.
3. Run `scripts/backup-database.ps1 -Destination <absolute .dump path>`.
4. Store the dump and generated SHA-256 manifest together.
5. Encrypt the destination at rest and restrict access to production operators.

The script refuses drive-root targets and refuses to overwrite an existing dump
unless the operator explicitly passes `-Force`.

## Restore drill

Run `scripts/verify-backup-restore.ps1 -BackupFile <absolute .dump path>`.
It restores into a disposable PostgreSQL instance under `C:\tmp`, verifies the
migration ledger, required product tables, and direct-message referential
integrity, then stops and removes the disposable cluster.

Run a restore drill at least every 90 days and after any material migration or
storage topology change. A backup is not qualified until a restore drill passes.

The protected `Production backup qualification` GitHub workflow also runs at
10:17 UTC every Monday, after the scheduled daily backup. It proves the live
release identity, runs `inspect-production-backup.mjs` inside the deployed Fly
machine so R2 and database credentials never enter the CI runner, and retains
the secret-free release and archive evidence for 90 days. Operators can dispatch
the same workflow with an expected commit after a material release. This proves
the newest production archive's size, SHA-256 manifest, private custody,
readability and required-table inventory. It does not replace the isolated
`pg_restore` drill above; archive inspection and restoration remain separate
evidence.

The protected `Production restore drill` workflow runs quarterly and on demand.
It builds a dedicated PostgreSQL 17 recovery image, launches it as a one-shot
Machine inside the existing Fly application and `iad` region, and inherits the
application's production secrets only inside that Fly boundary. The Machine has
no public service or DNS registration, reads only the newest completed backup
receipt through an explicit read-only transaction, verifies the private R2
archive and manifest, restores into a local
socket-only PostgreSQL cluster, transactionally applies repository migrations
missing from the archive, checks exact release-ledger parity, mandatory tables
and direct-message referential integrity, emits aggregate RTO evidence, and is
polled to its terminal state, queried only for Machine-scoped logs and removed
by exact Machine ID in an always-run cleanup step. GitHub retains only
secret-free evidence and execution logs for 90 days; neither the database dump
nor credentials leave the ephemeral Machine.
The temporary restore parent is traversal-only for the local PostgreSQL user;
the archive and manifest stay readable only by root.
Because Fly can return a nonzero launch status when a one-shot process stops
quickly, the workflow resolves the run-unique Machine independently of the CLI
exit code and accepts success only from the Machine-scoped recovery evidence.

The private bucket's retention period is a product/legal decision because the
rule deletes backup objects permanently. Do not enable an expiration lifecycle
until the approved retention period is recorded.
