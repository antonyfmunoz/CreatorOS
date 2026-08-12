# CreativesOS omnichannel Relationship Hub — v199

## Delivered scope

Release `v199` extends the production Relationship Hub from native and
Instagram into an official-API omnichannel kernel:

- Facebook Messenger Page OAuth, Page enumeration, encrypted Page tokens,
  signed webhooks, inbound normalization, delivery/read receipts, and outbound
  text or hosted-media replies.
- WhatsApp Business verified phone-number connection, encrypted system-user
  tokens, signed Cloud API webhooks, inbound text/media, delivery/read receipts,
  outbound text/media/audio, and explicit customer-service-window policy.
- X OAuth 2.0 PKCE, least-privilege DM scopes, encrypted access/refresh tokens,
  token renewal, signed webhook/CRC support, inbound and outbound DMs, media-ID
  delivery, and durable paginated reconciliation.
- Provider-neutral reconciliation claims with cross-machine exclusion, stale
  claim recovery, durable cursors, history backfill, inbox idempotency, and
  short polling fallback for providers that support it.
- Relationship Hub channel controls for Instagram, Messenger, WhatsApp, and X.
- An independent random Meta webhook verification secret generated directly in
  1Password and deployed without plaintext source or terminal disclosure.

TikTok and LinkedIn creator DMs are explicitly provider-policy blocked because
their generally available developer products do not expose the necessary
messaging APIs. CreativesOS does not use private-session scraping or label a
deep-link as a working unified-inbox connection.

## Verification evidence

- Full suite: 48 test files and 148 tests passed.
- TypeScript check passed.
- Production client/server build passed.
- Adapter tests cover normalization, echo suppression, signed webhook
  verification, X CRC, Meta challenge verification, text delivery, WhatsApp
  receipts, and disclosed audio-link delivery.
- Production code remains fail-closed until each provider's credentials,
  provider review, account connection, and live round trip are proven.

## External activation gates

- Meta: production app ID/secret, Instagram/Messenger/WhatsApp product review,
  professional/Page/WhatsApp Business accounts, and webhook subscriptions.
- X: client ID/secret, API secret, an API plan that permits DM operations and
  optionally Account Activity webhooks, and account authorization.
- ElevenLabs: API key and user-owned voice enrollment.

These gates are reported as `provider_pending`; they do not reduce the native
CreativesOS inbox, CRM, automation, AI-review, or delivery capabilities.
