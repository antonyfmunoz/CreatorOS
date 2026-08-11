# CreativesOS Relationship Hub operations

## Product boundary

The Relationship Hub is the CreativesOS-owned source of truth for customer
conversations, identities, consent, notes, tasks, tags, assignments, AI
suggestions, voice provenance, and delivery evidence. Provider APIs are
adapters. UMH may coordinate declared capabilities through the projection
bridge, but neither provider availability nor UMH availability is required for
the standalone native inbox.

## Durable delivery contract

Inbound provider events are signature-verified, normalized, hashed, and stored
with provider event idempotency before processing. Outbound actions are bound
to a business, connection, and canonical conversation, then executed through a
durable job with retry, dead-letter, stale-claim recovery, and a stable
idempotency key. Native delivery additionally records a receipt against the
legacy direct message so a retry cannot create a duplicate.

The export endpoint omits token ciphertext and webhook secrets. Provider
payloads are redacted after `RELATIONSHIP_PROVIDER_PAYLOAD_RETENTION_DAYS`
(default 30), voice assets expire with their generation jobs, and audit records
use `RELATIONSHIP_AUDIT_RETENTION_DAYS` (default 365).

## Provider activation

### Instagram

Required server settings:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `META_GRAPH_API_VERSION`
- `RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `PUBLIC_APP_URL=https://creativesos.net`

Configure the exact OAuth redirect URI:

`https://creativesos.net/api/relationship-hub/connections/instagram/callback`

Configure the webhook callback:

`https://creativesos.net/api/relationship-hub/webhooks/instagram`

Request only the implemented permissions:

- `instagram_business_basic`
- `instagram_business_manage_messages`
- `instagram_business_manage_comments`

Subscribe the connected professional account to `messages`, `messaging_postbacks`,
`message_reactions`, `comments`, and `live_comments`. Keep the connection in
testing until webhook challenge verification, signed inbound DM, outbound reply,
comment reply, comment-to-DM private reply, receipt reconciliation, token expiry,
revocation, rate-limit retry, duplicate webhook, and unauthorized-signature
tests all pass. The adapter does not claim Instagram audio upload support.

### AI suggestions

`OPENAI_API_KEY` activates evidence-linked suggestions. The model sees only the
minimum relationship and recent-message context required for the requested
draft. It cannot execute an external action directly. Replies, tasks, notes,
summaries, and escalations remain proposals until a permitted human review.
Hidden-trait or clinical psychoanalysis is prohibited; insights must cite
observable conversation evidence.

### Cloned voice

`ELEVENLABS_API_KEY` plus configured private R2 activates generation. A voice
profile is unusable until the signed-in owner attests ownership, provides
consent text, and the provider voice ID validates. AI-authored scripts require
the verified owner to approve the exact script before generation and delivery.
Every generated message carries synthetic-media provenance and disclosure.
Impersonation, credential requests, threats, emergency/medical/legal authority,
and deceptive identity claims are blocked.

## Release qualification

Before deployment, run the complete test/type/build verification and apply the
entire migration ledger to an empty PostgreSQL database. Then field-test native
sync, inbound rendering, outbound exactly-once delivery, notes, tasks, tags,
assignment, lifecycle state, agent policy, identity merge, secret-safe export,
anonymous authorization failures, and `/api/ready`.

After deployment, repeat the native and authorization tests against production.
Provider-specific status remains `provider_pending` until its credentials,
provider review, and full production round trip are independently proven.
