# CreativesOS Relationship Hub end-state qualification

This matrix separates the CreativesOS-owned product from external activation.
`native_complete` means the capability has a durable product path that can be
qualified without a third-party messaging, AI, voice, or realtime provider.
`provider_pending` means the product boundary is implemented and fail-closed,
but no production claim is made until the named provider passes its own live
round trip.

| End-state capability | Product evidence | Qualification state |
| --- | --- | --- |
| Standalone unified inbox | Native adapter, legacy DM synchronization, canonical conversations/messages, queue/search/assignment/status controls, capability-gated edit/delete/reaction/read actions | `native_complete` |
| Canonical relationship identity | Business-scoped relationship and external identity records, deterministic merge review, canonical merge transaction | `native_complete` |
| Cross-channel CRM timeline | Bounded relationship timeline across messages, consent, notes, tasks, and relationship audit actions | `native_complete` |
| Human relationship operations | Lifecycle, tags, notes, follow-up tasks, assignment, snooze, close/reopen, meeting binding | `native_complete` |
| Communication consent | Explicit STOP/START ingestion, operator evidence capture, deterministic latest-state resolution, automated-send suppression | `native_complete` |
| ManyChat-style keyword automation | Native and provider-neutral comment/DM triggers, exact/contains/prefix matching, cooldowns, opt-out, receipts, retries, approvals | `native_complete` |
| Governed AI relationship copilot | Business authority policy, evidence-linked suggestions, prompt-injection boundary, human review, re-check at execution | `native_complete`; inference generation is `provider_pending: OpenAI` |
| Reviewable relationship memory | Direct evidence requirement, accept/reject workflow, accepted-memory reuse in later conversation and meeting context, expiry | `native_complete` |
| Verified cloned-voice workflow | Owner attestation, use-case policy, exact-script approval, synthetic disclosure, private storage contract, revocation | `native_complete`; generation/send round trip is `provider_pending: ElevenLabs + channel` |
| Relationship-aware meeting AI | Role profiles, audience threshold, participant consent, bounded untrusted CRM context, minute reservation and stop budget | `native_complete`; live speech/transcription is `provider_pending: LiveKit workers` |
| Durable delivery | Transactional job, idempotency, cross-machine claim, retry, dead letter, stale recovery, immutable send/mutation receipts, audit, quota reservation | `native_complete`; external delivery is provider-specific |
| Tenant safety and billing boundary | Business policy, enforce/monitor mode, connection/message/AI/voice/realtime allowances, reservations, immutable usage ledger | `native_complete` |
| Operations and observability | Usage/health UI, provider-event and delivery counts, deduplicated alerts, acknowledge and automatic recovery resolution | `native_complete` |
| Privacy and retention | Tenant-specific payload/audit/artifact retention, proposal expiry, private voice deletion, complete secret-safe v2 export | `native_complete` |
| Provider capability gates | Registry-declared capabilities, disabled UI, encrypted token boundary, signature verification, no unofficial scraping fallback | `native_complete` |
| UMH coordination | Standalone-safe signed projection bridge, approvals, audit, durable outbox | `native_complete`; shared UMH pairing remains a separate activation gate |

## Provider-only activation gates

The following work must remain visibly pending until each live production round
trip is independently evidenced:

1. Meta app review, Instagram professional messaging/comment permissions,
   Messenger Page permissions, WhatsApp Business configuration, signed
   webhooks, and inbound/outbound/receipt/revocation tests.
2. X API plan and OAuth credentials, Account Activity or reconciliation access,
   inbound/outbound/receipt/token-refresh tests.
3. ElevenLabs credential and user-owned voice enrollment, generation, private
   playback, disclosed delivery, revocation, and deletion tests.
4. LiveKit transcription and realtime-agent workers that honor
   `relationshipUsage.maxMinutes`, emit transcript lineage, stop on consent or
   capacity loss, and complete live room tests.
5. Any future email/SMS/helpdesk adapter through the same provider contract;
   no provider may become the canonical relationship database.

TikTok and LinkedIn direct messaging remain unavailable unless an official,
approved API or partner program exposes the required capabilities. Private
session scraping is not an acceptable activation path.

## Release proof required

- Full tests, TypeScript, production build, and clean PostgreSQL migration
  qualification.
- Authenticated native field test for inbox initialization, send/edit/delete,
  reactions, read receipts, idempotency and cross-tenant denial,
  timeline, consent, notes, tasks, tags, assignment, AI policy, memory review,
  identity merge, export, usage, alerts, and room binding.
- Production readiness and migration parity on every active machine.
- Provider capability state remains `provider_pending` until the separate live
  qualification above passes.
