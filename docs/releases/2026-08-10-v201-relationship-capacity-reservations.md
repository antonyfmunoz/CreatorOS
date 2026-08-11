# CreativesOS Relationship Hub capacity reservations — v201

## Outcome

- Outbound messages, governed AI runs, verified voice generation, and linked
  realtime relationship-agent sessions reserve tenant capacity before paid or
  provider-backed work starts.
- PostgreSQL transaction-scoped advisory locks serialize reservations across
  every Fly machine. Concurrent requests cannot both claim the same remaining
  allowance.
- Successful work finalizes exactly once into the immutable monthly usage
  ledger. Failed, dead-lettered, and expired work releases the reservation.
- The operations panel distinguishes consumed usage from capacity reserved by
  active work.
- Final provider-account upserts are also serialized, so simultaneous OAuth or
  manual connection completions cannot exceed the business connection limit.

## Qualification evidence

- The complete migration ledger applies to empty PostgreSQL and includes the
  durable reservation table and indexes.
- A real PostgreSQL concurrency qualification proves exactly one of two
  simultaneous reservations is accepted at a one-unit limit.
- The same qualification proves idempotent finalization, failure release,
  tenant isolation, and serialized provider-connection capacity.
- Provider credentials, provider review, and provider production round trips
  remain separate external activation gates.
