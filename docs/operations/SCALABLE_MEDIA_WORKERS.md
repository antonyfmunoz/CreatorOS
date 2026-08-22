# Scalable media and CutStudio workers

The application can execute Media Cloud and CutStudio work in-process for a
small deployment or move either queue into independently scaled worker
processes without changing canonical assets, projects, or job records.

## Execution modes

- `MEDIA_PROCESSING_MODE=embedded` runs Media Cloud processing with the web
  process. Set it to `external` before starting one or more `npm run
  media:worker` processes.
- `CUT_STUDIO_PROCESSING_MODE=embedded` runs CutStudio processing with the web
  process. Set it to `external` before starting one or more `npm run
  cut:worker` processes.
- Every web and worker process must run the same immutable release image and
  migration ledger. A mixed-version queue is not supported.

The worker identity, region, capability list, concurrency and optional compute
rate are configured with `MEDIA_WORKER_*` or `CUT_WORKER_*`. Capability values
are allow-listed; arbitrary commands cannot be introduced through environment
configuration or job payloads.

## Safety properties

- A queued job is claimed through a compare-and-set database transition.
- The claim records the worker, region, random lease token and renewable lease
  deadline.
- Only the active lease holder can commit success or failure.
- A cancelled job changes durable state immediately. A remote lease heartbeat
  observes that lost claim and terminates its local FFmpeg process.
- Expired leases return to the queue with worker custody cleared; active leases
  are never recovered merely because a render is long-running.
- SIGTERM stops new claims, marks the node draining, gives active jobs a bounded
  ten-second completion window, and records offline only after local work has
  finished. An unfinished lease remains recoverable after its deadline rather
  than being silently reassigned while the old process may still commit.
- The operations surface reports active capacity, regions, draining nodes,
  stale nodes, job duration, error-budget consumption and configured compute
  cost attribution.
- Current stale-node alerts use a bounded incident window, while worker
  registrations with no heartbeat for seven days are pruned through an indexed
  maintenance path so routine deployments do not create permanent false alarms.

## Qualification

Run:

```powershell
npm run verify:worker-resilience
```

The qualification uses an isolated PostgreSQL cluster. It first makes two
distinct worker identities contend for each of the Media Cloud and CutStudio
jobs and proves that exactly one claimant obtains each lease. It then creates
simultaneous active and expired leases, performs recovery, and proves that only
expired custody is released. The protected CI and deployment qualification
repeat the same database exercise.

## Remaining scale evidence

This control plane makes independent and regional workers deployable; it does
not claim production scale by itself. A regional rollout must still prove the
selected machine sizes, storage throughput, representative 4K inputs,
long-duration cancellation, regional loss, queue saturation, cost ceilings and
artifact integrity. External live destinations and physical-device capture are
separate provider/device gates.
