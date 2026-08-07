# CreativesOS room-media provider handoff

This is the remaining provider-side contract for transcription and realtime AI.
CreativesOS already owns authorization, room policy, participant consent,
session lineage, durable transcript storage, retention, UI, recovery, and UMH
events. Provider workers must not bypass those controls.

## Required production configuration

- `LIVEKIT_TRANSCRIPTION_AGENT_NAME`: registered LiveKit agent name for speech-to-text.
- `LIVEKIT_ROOM_AGENT_NAME`: registered LiveKit agent name for disclosed realtime AI roles.
- `ROOM_MEDIA_INGEST_SECRET`: independent random secret of at least 32 UTF-8 bytes, configured in both CreativesOS and the transcription worker.
- Model, speech-to-text, and voice credentials belong only to the worker that needs them.

The ingest secret is never placed in room metadata, client bundles, logs, or UMH
events.

## Dispatch contract

CreativesOS dispatches the configured agent with JSON metadata shaped as:

```json
{
  "protocol": "creativesos.room-agent.v1",
  "roomId": "uuid",
  "communityId": "uuid",
  "sessionId": "uuid",
  "kind": "transcription | realtime_ai",
  "retentionDays": 30,
  "transcriptIngestUrl": "https://creativesos.net/api/community-room-media/transcripts",
  "profile": null
}
```

Realtime AI dispatches replace `profile: null` with the approved role profile,
including its ID, display name, role, disclosed mode, audience role, and
instructions. The worker must leave the room when its dispatch ends. It must not
continue listening after consent withdrawal or session stop.

## Final transcript segment delivery

The transcription worker sends only final segments to the supplied ingest URL:

```json
{
  "roomId": "uuid",
  "sessionId": "uuid",
  "providerSegmentId": "provider-unique-id",
  "speakerIdentity": "creativesos-user-123",
  "text": "Final transcript text.",
  "startTimeMs": 1000,
  "endTimeMs": 2400,
  "isFinal": true
}
```

Send the exact raw JSON body with these headers:

- `content-type: application/json`
- `x-creativesos-room-timestamp`: current Unix time in milliseconds as exactly 13 digits.
- `x-creativesos-room-signature`: lowercase hex HMAC-SHA256 of
  `<timestamp>.<raw-body>` using `ROOM_MEDIA_INGEST_SECRET`.

CreativesOS rejects malformed bodies, signatures outside a five-minute replay
window, secrets shorter than 32 bytes, non-final text, the wrong room, the wrong
session kind, inactive sessions, and segments arriving more than five minutes
after a transcription session stops. The exact session is authorized while its
dispatch is starting or active so an immediate first segment cannot lose a race
with dispatch confirmation. Segment idempotency is scoped to the exact
transcription session.

## Provider qualification gate

The provider phase is complete only when production evidence proves all of the
following:

1. A consented host can start transcription and see live captions.
2. At least two final segments from two speaker identities persist after reload.
3. A duplicate provider segment produces one durable record.
4. A bad signature, stale timestamp, wrong session, and anonymous request are rejected.
5. Stopping or withdrawing consent ends the provider dispatch and closes ingest after the grace period.
6. A disclosed realtime AI role joins, appears as AI, speaks only within its role, and leaves on stop.
7. Restarting the app reconciles abandoned starting sessions instead of leaving the room stuck.
8. No provider credential or transcript content appears in public readiness output or logs.
