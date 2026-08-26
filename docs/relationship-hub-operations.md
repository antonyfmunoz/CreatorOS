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

## Tenant usage, health, and billing boundary

Every business receives a durable Relationship Hub policy independent of its
payment processor. The policy controls active connections, monthly outbound
messages, AI runs, generated voice seconds, realtime relationship-agent
minutes, and tenant-specific retention. Inbound messages are always accepted
and metered so a billing limit cannot silently discard customer contact.
Outbound, AI, voice, and realtime starts fail closed when an enforced allowance
is exhausted. `monitor` mode records the same evidence without blocking.

Paid/provider work first takes an idempotent capacity reservation under a
PostgreSQL transaction-scoped advisory lock. This serializes simultaneous
requests across every app machine so two actions cannot both spend the same
remaining allowance. Successful work finalizes into the immutable monthly
ledger; failed and expired work releases its reservation. Provider delivery failures
create deduplicated operational alerts, while `/api/relationship-hub/operations`
returns only business-scoped used/reserved capacity, counts, and public-safe alert details.
The Relationship Hub screen exposes this as **Usage & health**. Stripe or a
future billing service may translate plans into this policy, but cannot become
the product's source of truth.

## Relationship-aware meetings

A business operator can link a community room they manage to one CRM
relationship and, optionally, its current conversation. This does not bypass
the community-room policy. Recording, transcription, and realtime AI still
require the room to be native/live, the capability to be enabled in advance,
and every active participant to grant the relevant consent.

When a role-scoped realtime AI participant starts, it receives a bounded
`creativesos.relationship-room-context.v1` brief: relationship stage and
summary, plus recent messages only when the binding allows timeline context.
Private notes are excluded by default. Every customer-authored field is marked
as untrusted evidence rather than an instruction; protected-trait inference and
hidden psychoanalysis remain prohibited. Actual realtime minutes are metered
when the agent session stops and retained room artifacts continue to follow the
room intelligence policy.

The Relationship Hub reserves up to 60 realtime minutes before dispatch and
includes `relationshipUsage.maxMinutes` with the agent job. A production agent
worker must stop before that boundary, and must also stop if consent is lost.
The worker is not considered activated until both behaviors are proven live.

## Human governance and data portability

The product exposes reviewed controls for communication consent, AI memory,
agent authority, duplicate-identity merges, operational alerts, and a canonical
cross-channel relationship timeline. Granted consent requires a specific
evidence note; denied or withdrawn states block automation. Accepted AI memory
is reused only as explicitly reviewed evidence and remains labeled with its
epistemic status.

The `creativesos.relationship-export.v2` export includes identities, consent,
conversations, messages, attachments, receipts, relationship and conversation
notes, tasks, tags, reviewed memory, AI suggestions, merge decisions, agent
policies, usage evidence, alerts, room bindings, and audit records. Provider
token ciphertext, webhook secrets, private voice scripts, and storage keys are
not exported.

## Provider activation

### Instagram

Required server settings:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `META_GRAPH_API_VERSION=v25.0`
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

CreativesOS subscribes the connected professional account to `messages`,
`messaging_postbacks`, `messaging_seen`, and `comments` during OAuth and rejects
the connection unless Meta confirms the subscription. Keep the connection in
testing until webhook challenge verification, signed inbound DM, outbound reply,
comment reply, comment-to-DM private reply, receipt reconciliation, token expiry,
revocation, rate-limit retry, duplicate webhook, and unauthorized-signature
tests all pass. The adapter supports one hosted or previously uploaded image,
video, or audio attachment per message; a live media round trip is still required
before production qualification.

### Facebook Messenger

Use the same Meta application or a separately reviewed production Meta app.
Set `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION=v25.0`, and
`RELATIONSHIP_META_WEBHOOK_VERIFY_TOKEN`. Configure this OAuth redirect URI:

`https://creativesos.net/api/relationship-hub/connections/messenger/callback`

Configure and subscribe the Page webhook callback:

`https://creativesos.net/api/relationship-hub/webhooks/messenger`

The app requests `public_profile`, `pages_show_list`, `pages_messaging`, and
`pages_manage_metadata`, enumerates only Pages on which the user has a relevant
task, stores each Page token encrypted, and requires Meta to confirm each Page's
message/postback/delivery/read subscription. Free-form sends are blocked after
the rolling 24-hour reply window. Provider review and a live Page DM/media/
receipt round trip remain mandatory.

### WhatsApp Business

Set `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION=v25.0`,
`RELATIONSHIP_META_WEBHOOK_VERIFY_TOKEN`, and `META_WHATSAPP_CONFIG_ID`.
Configure the WhatsApp product on the Meta app and use this callback:

`https://creativesos.net/api/relationship-hub/webhooks/whatsapp`

The primary connection flow is Meta Embedded Signup. CreativesOS creates a
short-lived, single-use state, launches the approved Facebook Login for Business
configuration, accepts signup events only from Meta's exact origins, exchanges
the authorization code only on the server, and never logs or returns the token.
The server verifies that the token is valid for this Meta app, has
`whatsapp_business_messaging` and `whatsapp_business_management`, proves the
selected phone belongs to the selected WABA, and requires Meta to confirm the
WABA webhook subscription before activating it. A system-user token flow remains
available as an administrator-only fallback and passes the same checks.

Text and one hosted or uploaded media item, including disclosed synthetic audio,
use the Cloud API. Free-form replies are re-checked at queue and delivery time
against the rolling 24-hour customer-service window. Outside that window the UI
loads the WABA's approved templates, collects template variables, and the server
rejects anything other than a validated approved-template request. A live
Embedded Signup, inbound, free-form, template, media, status, revocation, and
invalid-signature matrix remains mandatory before production qualification.

### X

Set `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_API_SECRET`, then configure this
OAuth 2.0 PKCE redirect URI:

`https://creativesos.net/api/relationship-hub/connections/x/callback`

The implementation requests only `dm.read`, `dm.write`, `tweet.read`,
`users.read`, and `offline.access` (X requires `tweet.read` with DM scopes). It
supports signed Account Activity webhooks when the X plan
allows them and also reconciles DM history with a durable cursor so brief
webhook interruptions do not lose messages. X API access and pricing remain a
provider-owned activation gate.

### Intentionally unavailable channels

TikTok and LinkedIn do not currently expose a generally available creator-DM
API suitable for this product. CreativesOS does not scrape private sessions or
pretend a deep-link is a unified inbox connection. Their publishing features
remain separate; inbox activation waits for an approved official API or formal
partner access.

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
usage limits, operations telemetry, relationship-room binding, consent-gated
context dispatch, anonymous authorization failures, and `/api/ready`.

After deployment, repeat the native and authorization tests against production.
Provider-specific status remains `provider_pending` until its credentials,
provider review, and full production round trip are independently proven.
