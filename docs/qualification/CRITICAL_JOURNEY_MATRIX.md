# CreativesOS critical journey qualification

This matrix is the release boundary for the standalone projection. A provider
being unavailable may reduce an integration, but must not break the native
workflow, its evidence, or its recovery path.

| Area | Critical journey | Primary roles | Release evidence |
| --- | --- | --- | --- |
| Identity | Register, sign in, sign out, return to the intended route | visitor, creator | Clerk production flow and authenticated `/api/user` |
| Social | Create every supported post/story type, view, react, comment, save, repost once | creator, audience | persisted API response and refreshed feed/profile state |
| Profiles | Navigate mentions, slide/click profile tabs, follow/unfollow | creator, audience | correct URL, selected navigation, persisted relationship |
| Marketplace | Search, inspect a published product, save, add to cart | buyer | stable product identity and account-backed cart |
| Commerce | Checkout a one-time or recurring offer, verify order, grant entitlement, view purchase, cancel renewal | buyer | verified provider event, billing snapshot, order, subscription state, entitlement, notification |
| Earnings | Connect creator payout account and inspect one-time and recurring paid-invoice allocations | creator | creator-owned Connect status; provider-event idempotency; platform revenue remains separate |
| Communities | Discover, join, enter, post, reply, poll, moderate, leave | member, moderator, owner | membership gate and durable channel state |
| Conference room | Join, consent, record, transcribe, create notes/actions, review insights | member, host, approved AI role | attendance, consent, media lineage, review evidence |
| Learning | Buy/access course, progress, complete assessment | learner, creator | entitlement, progress, score and unlock rules |
| Business | Create campaign, offer, course, inspect performance | owner, operator | business authority and persisted planning/metrics |
| Distribution | Draft, connect channel, queue, dispatch, inspect attempt | creator, operator | provider-neutral job and immutable delivery attempts |
| Automations | Create from template, activate, run/message/event/schedule, approve, retry/cancel | creator, owner, operator | definition version, run/step ledger, approval, audit, conversation |
| Relationship Hub | Initialize native inbox, send, manage CRM, review consent/memory/identity, automate, export, inspect health | owner, operator, approved AI role | canonical timeline, delivery receipt, human review, usage reservation, audit |
| Moderation | Report content, review queue, enforce membership/content action | member, moderator | scoped authority and audit evidence |
| Privacy | Export/delete owned data; expire retained automation/media records | account owner | bounded export and verified cleanup result |
| UMH bridge | Receive signed scoped command, require approval, emit evidence/outbox | paired installation | signature, replay, tenancy and correlation evidence |

## Required release gates

1. `npm run verify:migrations` succeeds against an empty PostgreSQL 16 database.
2. Unit and contract tests, TypeScript, and production build pass.
3. Production migrations and readiness checks pass on every live machine.
4. Browser field tests cover the routes and role transitions above.
5. No credential, private asset key, raw prompt secret, or private guest brief appears in logs or public responses.
6. External providers are qualified independently; a deferred provider is clearly labeled and cannot make native data inconsistent.
