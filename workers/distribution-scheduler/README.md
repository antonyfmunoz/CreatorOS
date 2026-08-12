# CreativesOS distribution scheduler

This Worker is the durable trigger for scheduled distribution jobs. It runs
once per minute and makes one authenticated request to the production app.
The app atomically claims due jobs, so a simultaneous in-process dispatch is
safe and cannot publish the same job twice.

The Worker also requests one private-R2 PostgreSQL backup each day at 09:17
UTC. Backup requests are date-idempotent and leave a durable database record,
custom-format dump, and SHA-256 manifest. The Worker has no public route. Its only secret is
`DISTRIBUTION_DISPATCH_SECRET`, which must match the Fly secret of the same
name. Keep the value in 1Password; never place it in this repository.

Operational validation:

1. `npx wrangler deploy --dry-run --config workers/distribution-scheduler/wrangler.jsonc`
2. Deploy the Worker, set its secret with Wrangler, then verify its Cron logs.
3. Schedule a disposable CreativesOS-only distribution job one minute ahead
   and verify it is published after the app has been allowed to suspend.
4. Trigger the daily schedule in a controlled production qualification and
   verify the `production_backups` record, dump object, manifest object, size,
   and SHA-256 evidence.
