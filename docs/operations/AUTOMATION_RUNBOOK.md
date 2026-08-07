# Conversational automation operations

## Product boundary

The automation kernel is native CreativesOS capability. Provider adapters may
add actions, but they do not own definitions, authorization, approvals,
budgets, schedules, conversations, retention, or audit evidence. Standalone
operation must continue when UMH or any external provider is unavailable.

## Runtime states

- Definitions: `draft`, `active`, `paused`, `archived`.
- Runs: `queued`, `running`, `waiting_approval`, `succeeded`, `failed`,
  `canceled`, `dead_letter`.
- A run is claimed with a conditional database update. Multiple application
  machines may poll safely; only one can move a due run from queued to running.
- Native side effects commit an action receipt in the same transaction as the
  resource. A recovered step returns that receipt instead of duplicating work.
- Consequential tools pause before execution. Approval decisions are one-time,
  actor-bound, and audited.

## Recovery and retention

- A running job with no heartbeat for two minutes is returned to the queue.
- Retry backoff is exponential and capped at 60 seconds. Exhausted automatic
  retries move the run to `dead_letter`; an owner can retry it manually.
- Cancel is cooperative. An already-committed native side effect remains in its
  owning product ledger, but no later steps are started.
- Free-form input, output, approval evidence, receipts, and conversation text
  are redacted after the definition's retention period. Status, timestamps,
  cost units, and append-only audit events remain.
- User export is available at `/api/automations/export`. Destructive deletion
  requires the exact confirmation phrase `DELETE MY AUTOMATIONS`; audit events
  are de-identified rather than deleted.

## Qualification and alerts

Run `npm run verify:migrations` against an empty PostgreSQL 16 database, then
`npm run verify:automations`. Qualification must prove idempotency, 50-run
concurrency, approval gating, bounded retries, dead-letter behavior, stale-run
recovery, cost accounting, receipts, and append-only audit protection.

Alert on any of the following for five minutes:

- queued runs increasing while completed runs remain flat;
- running runs older than two minutes after a recovery pass;
- dead-letter count increasing;
- approvals older than the product response target;
- hourly run or cost-unit budgets being rejected repeatedly;
- readiness missing any automation table or action-receipt table.
