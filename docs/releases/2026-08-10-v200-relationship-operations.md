# CreativesOS Relationship Hub controls and realtime context — v200

## Delivered scope

- Business-owned usage policy and idempotent monthly ledger for outbound
  messages, AI runs, verified voice seconds, and realtime relationship-agent
  minutes. Inbound customer messages remain non-blocking and metered.
- Active-connection allowance, enforce/monitor modes, tenant retention values,
  and a provider-independent boundary that billing systems can configure.
- Deduplicated provider/delivery health alerts and an authenticated operations
  snapshot, surfaced in the Relationship Hub as **Usage & health**.
- CRM-to-community-room binding with a user-facing room picker.
- Consent-preserving LiveKit dispatch context for role-scoped AI participants:
  a bounded relationship summary and timeline labeled as untrusted evidence,
  with private notes excluded by default.
- Realtime session metering at stop, retention integration, audit evidence, and
  release-readiness reporting.

## Qualification gates

The native schema, routes, UI, authorization, metering, and policy paths can be
qualified without an external provider. Live audio, transcription, and an AI
participant still require the existing LiveKit agent runtime and participant
consent. Meta, X, and ElevenLabs remain separate provider-owned activation and
round-trip gates.
