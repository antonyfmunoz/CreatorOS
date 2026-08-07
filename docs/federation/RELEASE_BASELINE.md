# CreativesOS release baseline and gates

## Current baseline

- Canonical product name: `CreativesOS`; repository/deployment aliases remain
  legacy operational details.
- Standalone social, community, commerce, campaign, course, asset, and
  projection-outbox foundations exist.
- Private R2 delivery is configured: creators can attach private files to an
  offer and entitled buyers receive only short-lived, authorized read URLs.
- Native LiveKit community media is implemented and production-verified with
  short-lived room-scoped tokens and durable attendance. Recording now has a
  consent-gated LiveKit Egress lifecycle, private R2 destination, status/error
  reconciliation, retention cleanup, and entitlement-style private download.
  Production proved no-media rejection without a provider job, active-state
  polling, safe stop, modern/legacy provider-result reconciliation, and a
  49-second private `video/mp4` object with 885,822 bytes. The completed
  recording is visible to an authorized room manager; anonymous room-media and
  recording-download probes return `401`.
- Live transcription has a realtime caption surface, signed and replay-bounded
  final-segment ingestion tied to the exact authorized session, durable
  provenance, retention, startup recovery, transcript copying, and provider
  dispatch lifecycle. It fails closed for short ingest secrets and accepts a
  stopped session only for a five-minute finalization grace period. It is not
  runtime-qualified because no approved transcription agent name, ingest
  secret, or deployed agent worker is configured.
- Room intelligence policy, role-scoped AI profiles, participant consent, and
  verified-fact guest briefs are implemented locally. No realtime AI listener
  or speaking AI participant is claimed until an approved agent runtime is
  connected and production-tested.
- The provider-neutral meeting workspace is production-verified for durable
  room notes, dated and member-assigned action items, completion changes, and
  reload persistence.
  Date-only deadlines preserve the selected calendar day across timezones.
- Evidence-backed room suggestions now require an explicit manager review.
  Production qualification proved transactional conversion to a durable note,
  conversion to an action item, dismissal without an artifact, and persistence
  after reload. The source insight, reviewer, review time, and accepted artifact
  link remain auditable.
- The native recap exporter is production-verified. It copies the room title,
  schedule, attributed notes, action state, due dates, and owners without
  requiring a transcript, model, or external meeting provider.
- Authenticated marketplace carts are account-backed and server-authoritative.
  Guest selections merge after sign-in; add, reload, badge, remove, and removal
  persistence are production-verified. Cart checkout groups mirror the payment
  policy so platform offers and each creator's payout offers produce valid,
  separate orders without losing the remaining cart.
- Public marketplace, storefront, and offer-detail surfaces expose published
  offers only. Production qualification proved a synthetic draft returned no
  marketplace result, no storefront result, and a public-detail `404` before
  the exact fixture was removed. Order preparation also rejects active
  entitlements server-side to prevent duplicate billing outside the UI.
- The existing bridge has durable outbox, signed ingress, replay protection,
  outcomes, and local approvals for the currently declared command surface.
- `GET /api/ready` separately reports process/database readiness and the
  public-safe release posture for authentication, private asset delivery,
  optional UMH binding, recording, transcription, transcript ingest, and
  realtime AI. Deferred external workers are reported as `provider_pending`
  without exposing settings or blocking the otherwise ready standalone app. It
  also proves that the durable federation correlation columns exist. A healthy
  process is not automatically release-ready.
- The current production readiness response reports `release_ready`, a ready
  database, configured production authentication, and configured private R2
  delivery. Anonymous probes receive `401` for room details, notes, actions,
  and intelligence while the authentication page remains publicly reachable.
- Production release `v188` applied transcript-lineage migration 49. The live
  schema has a required agent-session reference, session-scoped provider
  segment idempotency, zero orphan transcript segments, and no abandoned active
  recording or agent sessions at qualification time. Both Fly machines passed
  health checks; unsigned transcript ingest and anonymous room/media probes
  returned `401`.

## Release gates before expanding federation

1. Commit the existing worktree deliberately; separate unrelated historical
   changes from the release candidate.
2. Apply migrations in a non-production qualification environment before any
   new production migration.
   Migration identifiers must be forward-only and unique in the deployed
   ledger; use idempotent repair migrations if a historical identity was
   already consumed.
3. Pass type check, full test suite, build, migration verification, and
   browser field tests for an unauthenticated user, member, manager, and owner.
4. Prove one shared-contract command/event round trip with UMH and preserve the
   returned outcome and reconciliation record.
5. Prove replay rejection, an approval-required external publication, offline
   outbox retry, and UMH-unavailable local workflow continuity.
6. Re-qualify protected paid delivery after any storage, entitlement, or
   checkout change; it is currently configured and field-tested.
7. Replace development authentication keys before public production release.

## Repeatable production deployment

Inject the checked 1Password environment template and call
`scripts/deploy-production.ps1`. The script validates the public Clerk key
format before Fly receives it, preventing shell escaping from adding invalid
characters to the frontend build argument.

## Explicitly deferred until the shared contract gate

- New UMH command types for community rooms or providers.
- Business-to-community control bindings.
- New provider OAuth/webhook surfaces beyond the already implemented adapters,
  plus production qualification of the external transcription and realtime AI
  agent workers.
- Any federation route that reads or writes a projection database outside the
  existing signed local ingress/outbox pattern.
