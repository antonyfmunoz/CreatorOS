# CreativesOS backup and restore runbook

## Backup

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
