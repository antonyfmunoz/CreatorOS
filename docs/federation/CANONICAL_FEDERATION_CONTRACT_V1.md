# Canonical Federation Contract v1 — CreativesOS adoption proposal

**Status:** proposed for synchronized adoption by UMH, LyfeOS, EOS, and
CreativesOS. This is not evidence of a completed cross-product round trip.

## Envelope invariants

All governed commands, events, outcomes, approvals, and manifest snapshots use
the following immutable header shape:

```text
contract_version        umh.federation.v1
message_id              UUID
message_kind            command | event | outcome | approval | manifest
product_id              umh | lyfeos | eos | creativesos
installation_id         product installation UUID or stable configured ID
idempotency_key         stable per semantic operation
correlation_id          workflow-level identifier
trace_id                hop-level diagnostic identifier
principal               authenticated actor identity and local mapping reference
tenant                  product tenant reference and type
workspace               optional narrower scope (community, project, household, etc.)
authority               local role/policy/delegation basis
issued_at / expires_at  ISO 8601; expiry required for commands
consent                 policy/consent references or explicit none-required basis
payload                 versioned, schema-specific body
```

Each HTTP transport signs the exact serialized body and carries a timestamp and
nonce. Receivers persist nonce/replay state, command receipt, outcome, and
evidence references before acknowledging a governed mutation.

## Authority model

- A projection is the exclusive writer of its domain database.
- UMH may dispatch a signed command only to a capability advertised by the
  projection's manifest.
- The projection independently validates principal, tenant, workspace,
  authority, consent, signature, expiry, and idempotency before acting.
- An approval is a projection-local decision. UMH records and reconciles it but
  cannot convert a rejection into execution.

## Capability manifest v1

Each product reports a versioned manifest containing:

- capability ID, kind (`native`, `projection`, `provider`), and operation;
- authoritative product and tenant/workspace requirements;
- approval, consent, and retention requirements;
- provider and native fallback state;
- availability/health, risk, cost/latency class, and proof status;
- supported command/event/outcome schemas and compatibility window.

## CreativesOS compatibility position

CreativesOS currently exposes `umh.v1`, `umh.command.v1`, and `umh.event.v1`
over signed HTTPS. It has durable outbox, inbox, replay rejection, outcomes, and
local approval mechanics. Its capability manifest now identifies this as
**pending shared qualification**, rather than claiming the proposed
`umh.federation.v1` has been verified with the other products.

The inbound projection boundary now validates and normalizes a canonical
`umh.federation.v1` command only when it is bound to the configured
CreativesOS installation. It maps into the existing internally tested command
representation and does not add a command type, bypass local authorization, or
accept a missing installation binding. Legacy `umh.command.v1` remains
available only for the existing paired-transport migration window.

## Qualification sequence

1. Publish identical fixtures and negative cases in every repository.
2. Prove manifest discovery and signature validation.
3. Dispatch one low-risk command to each projection.
4. Verify local result, durable outcome, durable event, replay rejection, and
   reconciliation record.
5. Prove UMH outage leaves each projection's local workflow usable.

## CreativesOS hand-off package

The repository includes a deterministic low-risk draft-command fixture at
`tests/fixtures/umh-federation-v1/creativesos-content-draft-command.json` and
the expected durable evidence at
`tests/fixtures/umh-federation-v1/creativesos-content-draft-expected-evidence.json`.
They are a shared-contract test vector, not a production credential or an
assertion that either system has accepted the message.

Use `ROUND_TRIP_QUALIFICATION.md` for the exact mutually observable pass/fail
sequence. The two sides must agree on the canonical envelope before either
side starts translating, accepting, or silently dropping fields.
