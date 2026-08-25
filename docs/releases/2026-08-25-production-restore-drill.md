# Isolated production restore drill

Date: 2026-08-25

## Outcome

CreativesOS now has a quarterly and on-demand recovery workflow that restores
the newest real production backup without moving the archive or its credentials
into GitHub Actions.

The protected workflow builds a dedicated PostgreSQL 17 recovery image and
launches it as a named one-shot Machine inside the existing `creatoros-app` Fly
application and `iad` region. The Machine has no public service, does not
register in internal DNS, uses a socket-only temporary PostgreSQL cluster and is
polled through its terminal state and removed by exact Machine ID in an
always-run cleanup step.

The workflow treats the Fly CLI launch result as transport state rather than
recovery proof: a short-lived one-shot process can stop before `flyctl machine
run` reports a successful start. The workflow therefore resolves the uniquely
named Machine even after a nonzero launch result and judges the drill only from
that Machine's terminal state and scoped recovery evidence.

The drill:

- proves the live release identity before recovery begins;
- reads only the newest completed production backup receipt;
- downloads the archive and manifest from private R2 inside Fly;
- verifies durable size and SHA-256 agreement before restore;
- rejects a newest archive older than the 30-hour recovery-point threshold;
- restores into isolated PostgreSQL with no production connection target;
- transactionally advances the restored migration ledger to the exact current
  release before validation;
- checks 26 mandatory tables and direct-message
  referential integrity;
- measures recovery time; and
- retains only aggregate, secret-free evidence and logs for 90 days.

The receipt lookup uses an explicit read-only transaction with a transaction-
local timeout. This enforces the no-write boundary without unsupported startup
parameters on Neon's pooled production connection.
The temporary parent directory grants the unprivileged PostgreSQL process only
the traversal permission needed to reach its owned cluster and socket
directories; the archive and manifest remain mode `0600`.

## Production evidence

GitHub Actions run
[`32897371297`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32897371297)
passed on 2026-08-25 against verified live commit
`54b7e1faac5464fd0a0395beba2e9cc8453b25e8`. It restored private backup
`a0d53d2d-1fb0-461c-bdea-3b8a60744bfa` (1,136,997 bytes), matched both the
receipt and manifest hashes, proved the backup was 73,495 seconds old against
the enforced 108,000-second ceiling, advanced the archive from 107 to the
release's exact 108 migrations by applying one pending migration, verified
latest migration `1787601600000`, 26 mandatory tables and zero orphan direct
messages, and measured an 18-second RTO. Recovery Machine `84ed239ae571d8` had
no public service and was explicitly destroyed after evidence collection.

## Qualification boundary

Shell syntax, workflow security contracts, the complete code/build suite and
source-secret scan pass. The Fly remote builder and the dated ephemeral
production execution above are the authoritative image and real-archive
qualification because Docker Desktop is not active in the local environment.

The drill does not prove cross-region recovery, paid regional loss, a production
traffic cutover or sustained production volume. Those remain deliberate scale
and operational exercises.
