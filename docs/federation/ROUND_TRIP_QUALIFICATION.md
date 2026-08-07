# CreativesOS / UMH round-trip qualification

**Status:** ready for a paired UMH environment; not yet executed.

## Purpose

Prove one low-risk operation end-to-end without weakening a projection's local
authority. The pilot is `content.draft.create`: it creates a private draft in
CreativesOS and never publishes content or moves money.

## Shared test vector

- Command: `tests/fixtures/umh-federation-v1/creativesos-content-draft-command.json`
- Expected evidence:
  `tests/fixtures/umh-federation-v1/creativesos-content-draft-expected-evidence.json`
- Contract: `umh.federation.v1`
- Existing transport compatibility: signed HTTPS with `umh.command.v1` and
  `umh.event.v1`

The fixture uses only synthetic IDs and text. Replace its installation,
principal, tenant, and workspace references with the bound private-pilot
values before signing; keep `message_id`, `idempotency_key`, and
`correlation_id` stable for the test.

## Preconditions

1. UMH and CreativesOS have agreed on one canonical envelope mapping. No
   required canonical field may be discarded.
2. CreativesOS has a real `UMH_INSTALLATION_ID`, inbound signing secret, and
   outbound event URL/signing secret. The manifest must show installation
   `bound` and both configured integrations `true`.
3. The fixture's mapped local user is an active manager of the mapped
   CreativesOS business tenant.
4. The clock skew is below the signed-request validity window, and the
   command expiry has not passed.

## Evidence sequence

1. UMH reads `GET /api/umh/manifest` and records the declared contract,
   capability, local-approval, and provider states.
2. UMH signs and sends the mapped private-draft command to
   `POST /api/umh/commands`.
3. CreativesOS records the nonce, receipt, command, local draft, durable
   outcome, audit record, and outbox event before acknowledging the mutation.
4. UMH receives and correlates the durable outcome/event using the stable
   operation identifiers.
5. Re-send the exact request: the projection returns a replay result without
   creating another draft or second event.
6. Send the request with one body byte changed but the original signature:
   the projection rejects it. Send an expired request: the projection rejects
   it. Both failures must leave no draft mutation.
7. Temporarily make UMH unavailable, then create a local draft in CreativesOS.
   The local workflow must succeed and queue any federation event in the
   durable outbox for later delivery.

## Exit criteria

The qualification is complete only when both systems retain matching evidence
for the same correlation and idempotency keys, exactly one draft exists, the
replay and tamper probes were rejected, and the independent-local workflow
succeeded during the UMH outage. Until then the public manifest remains
`pending_shared_round_trip`.
