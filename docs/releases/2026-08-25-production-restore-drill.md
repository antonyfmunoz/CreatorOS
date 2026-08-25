# Isolated production restore drill

Date: 2026-08-25

## Outcome

CreativesOS now has a quarterly and on-demand recovery workflow that restores
the newest real production backup without moving the archive or its credentials
into GitHub Actions.

The protected workflow builds a dedicated PostgreSQL 17 recovery image and
launches it as a one-shot Machine inside the existing `creatoros-app` Fly
application and `iad` region. The Machine has no public service, does not
register in internal DNS, uses a socket-only temporary PostgreSQL cluster and is
automatically removed when it exits.

The drill:

- proves the live release identity before recovery begins;
- reads only the newest completed production backup receipt;
- downloads the archive and manifest from private R2 inside Fly;
- verifies durable size and SHA-256 agreement before restore;
- restores into isolated PostgreSQL with no production connection target;
- checks the migration ledger, 25 mandatory tables and direct-message
  referential integrity;
- measures recovery time; and
- retains only aggregate, secret-free evidence and logs for 90 days.

## Qualification boundary

Shell syntax, workflow security contracts, the complete code/build suite and
source-secret scan must pass before merge. The Fly remote builder and first
ephemeral production execution are the authoritative image and real-archive
qualification because Docker Desktop is not active in the local environment.

The drill does not prove cross-region recovery, paid regional loss, a production
traffic cutover or sustained production volume. Those remain deliberate scale
and operational exercises.
