# CutStudio bounded cloud-start admission

Candidate implementation; qualification and deployment are separate gates.

## Gap addressed

A lost or failed dispatch response does not prove Cloud Run rejected the start.
Previously the caller cleared its heartbeat, allowing rapid repeated polling to
request more starts. Worker-claim limits alone do not cover this pre-claim path.

## Behavior

- A database-owned reservation serializes application replicas. Each job has at
  most three automatic start requests, separate from its worker-attempt count.
- The existing 30-minute cold-start window is retained after an unknown outcome.
  Dispatch state is separate from heartbeats that an older worker may clear.
- The final request keeps its complete window. Only queued work can exhaust this
  start budget; a live worker lease is not cancelled by dispatch expiration.
- Failure details are fenced by the current reservation token, cancellation,
  state and expiry. A stale response cannot overwrite a new reservation.
- After exhaustion, the job fails explicitly. An owner-requested retry creates
  one idempotent child job with a fresh budget; no automatic child is created.
- Cancellation wins over recovery. Malformed success responses are not accepted
  as evidence that a worker started. Reservation database errors are caught and
  never converted to permission to dispatch.

## Qualification required

`qualify-cut-dispatch-budget.ts` runs against disposable PostgreSQL: eight
concurrent claims, one reservation; unknown response, heartbeat independence,
stale response fencing, three requests without a fourth; final-window retention,
cancellation, a live worker and explicit retry. It invokes no cloud provider.
Client tests cover signed dispatches, unconfirmed responses and transport failure.
All existing worker lease, cancellation, recovery and publication tests remain.

## Rollout and limits

Migration 0121 is additive. It preserves a queued legacy heartbeat as one observed
dispatch and retains its outstanding window; it does not invent older history.
New app code enforces reservation admission after rollout. Old native workers do
not need new fields to claim a job. Qualify the exact deployed app independently.

This is not a hard spending cap, exact per-execution billing or fleet admission.
The existing dispatcher starts a queue-consuming worker, not an explicitly bound
job. Provider retry behavior, worker-image activation, cold-start latency and
competitor-quality benchmarks remain distinct gates. No new provider service,
IAM grant, scheduled job, warm capacity or topology change is included.
