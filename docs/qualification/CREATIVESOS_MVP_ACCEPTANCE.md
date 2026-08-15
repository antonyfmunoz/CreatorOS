# CreativesOS MVP acceptance boundary

> This document preserves the first production-MVP acceptance record. The
> broader current desired-state candidate is tracked in
> [CREATIVESOS_END_STATE_PARITY.md](CREATIVESOS_END_STATE_PARITY.md), and its
> local qualification must not be confused with a current production deploy.

This is the release boundary for the first genuinely usable CreativesOS
product. It is narrower than the desired end state, but it must complete the
full creator-to-customer loop without mock state or dead controls.

## MVP outcome

A creative can register, receive a default business workspace, publish native
content, build an audience, manage conversations, create and distribute an
offer, collect payment, grant durable access, operate a community or course,
and see the commercial result. A buyer can discover the offer, pay, receive
the right access, and manage a recurring renewal. Provider-disabled features
must fail closed without breaking the native workflow.

## Required capabilities

| Capability | MVP acceptance | Current local state |
| --- | --- | --- |
| Identity and workspace | Separate login/registration, Clerk identity binding, intended-route return, and automatic default business | qualified before this release |
| Native social | Text/image/video posts and stories; mentions, follows, comments, reactions, save, and one-level repost | qualified before this release |
| Profiles and navigation | Public profile, owner editing, six clickable/slidable tabs, route-correct global navigation | qualified before this release |
| Distribution | Provider-neutral draft, schedule, queue, cancel, retry, and delivery evidence; unavailable providers remain explicit | native path qualified; each external channel remains an activation gate |
| Relationship Hub | Native unified inbox, CRM timeline, consent, assignment, notes, tasks, tags, and native message delivery | qualified before this release |
| Automations | Comment/DM keyword rules, activation, cooldown, opt-out, approval, retry, and receipts | native path qualified before this release |
| Offer catalog | Explicit digital download, course, community, and membership types | implemented and locally qualified in migration 0061 |
| Billing models | One-time checkout plus monthly/yearly recurring community or membership checkout | production-qualified with a $1 monthly Stripe sandbox membership |
| Marketplace | Search/filter, stable detail routes, free-community discovery, paid-community offers, saved items, and durable cart | implemented and browser-qualified on mobile and desktop |
| Native UGC | Creator portfolio, brand brief, discovery/application, selection, private review/revision, approval, performance and creator-earnings evidence | provider-independent lifecycle implemented and browser-qualified on mobile and desktop; live ad attribution and funded settlement remain separate provider gates |
| Entitlements | Verified payment grants product access and linked community membership; cancellation/revocation removes access at the correct lifecycle point | production-qualified through signed checkout, cancellation, terminal revocation, and stale-event replay |
| Paid-community gate | A product-linked community cannot be joined without an active entitlement and direct links route unpaid visitors to its offer | implemented and browser-qualified on mobile and desktop |
| Learning | Course curriculum, lesson progress, assessments, completion, and entitlement enforcement | qualified before this release |
| Commerce separation | Platform revenue and creator proceeds are separate; Connect routes creator funds and records each recurring paid invoice | production data contains a paid creator allocation; platform subscription revenue remains separate; invoice handling is enabled and replay-safe |
| Subscription management | Buyer can cancel renewal while retaining access through the paid period | production-qualified through buyer cancellation, retained paid-period access, and terminal cancellation |
| Safety and operations | Moderation, privacy/export/deletion, readiness, migration, backup, security, and capacity gates | production-qualified through v305 with private backup evidence, protected main, and zero open Dependabot, code-scanning, secret-scanning, source-secret, or production-dependency findings |
| Projection kernel | Signed, scoped, replay-safe UMH ingress and durable outbox; CreativesOS remains standalone | projection side qualified; UMH pairing is outside this repository |

## Explicit external or post-native gates

- Additional social, messaging and live-destination activation beyond
  currently approved credentials.
- Provider transcription, realtime AI participation, cloned-voice generation
  and remote-guest media transport. Native recording, transcript ingest,
  participant intelligence, CutStudio and Broadcast foundations are complete.
- A successful Stripe creator payout after the connected sandbox account's
  errored test bank is replaced.
- Authorized side-by-side competitive benchmarks and qualified operator review;
  these are evidence gates, not hidden native implementation work.
- UMH-side cockpit pairing and portfolio-wide capability negotiation.
- Binding legal publication until operator and counsel decisions are complete.

## Release gates

- [x] Product and billing policy unit tests.
- [x] TypeScript, production build, and bundle limits.
- [x] Fresh PostgreSQL migration applies all 80 migrations and verifies 68 required tables and 27 critical columns.
- [x] Mobile and desktop browser proof for recurring community publication,
  paid join denial, compatible order snapshots, catalog visibility, and price cadence.
- [x] Full 116-execution mobile and desktop browser matrix passed after the
  production-discovered Membership category correction.
- [x] Deploy migration and application to production.
- [x] Production smoke test for provider-independent routes.
- [x] Stripe test-mode checkout, signed webhook, entitlement, recurring invoice,
  creator allocation, renewal cancellation, and terminal access revocation.

The MVP is not `verified_complete` until every unchecked release gate above is
completed. Local implementation alone is not production completion.

## Current production evidence

Fly release `v305`, including route-navigation correction commit `22d7cb9`, passed its release migration and its required live machine
reports a passing health check. `/api/health` is `ok`; `/api/ready` is `ready` with no
release blockers, production Clerk authentication, private R2 delivery, the
native automation kernel, the Relationship Hub kernel, and community-room
media configured. The current production candidate passed 289 automated
tests across 73 test files, TypeScript, production build and bundle limits, the
572-file source secret scan, zero production dependency vulnerabilities, all 116
mobile and desktop browser executions, backup/restore recovery, and a 200-request
capacity probe with zero failures.

The anonymous entry redirects server-side to `/auth/login`. Its last production
Lighthouse trace scored 96 performance and 100 accessibility with 1.70 s
FCP/LCP, 209 ms total blocking time, 0.019 CLS and 99 ms server response. The
authenticated-only application overlays are deferred outside auth, reducing
the initial JavaScript budget measurement to 109,391 gzip bytes.

The signed-in production field tests cover profile tab selection, Marketplace
search, stable product routing, route-correct navigation, communities, the
Relationship Hub inbox, Broadcast, a real CutStudio project, Distribution,
automations and the Create hub with no browser errors. The v305 sweep directly
verified the active bottom-navigation destination on Explore, Marketplace,
Broadcast, Communities, Profile, Privacy settings, and CutStudio; Broadcast
and CutStudio correctly retain Create. After upgrading the
upload middleware, a production image was uploaded and published as a story;
the feed changed from `Create a story` to `View your story` with no browser
errors. The private production
backup was uploaded, downloaded, checksum-matched, archive-read, and verified
to contain the required tables; a duplicate same-day request returned the
existing completed receipt rather than creating a second backup. Production
security headers include HSTS, an explicit Clerk-aware CSP, no-cache HTML, and
immutable caching for hashed assets. GitHub main-branch protection requires
Core, Database and durable workflows, Browser journeys, and CodeQL checks.

The production Stripe sandbox proof used order
`78945018-6970-40cb-b0a1-70b9ab615096` and subscription
`sub_1U3OwPPYAgbSUeFT3kk98t3b`. Checkout granted the product entitlement and
linked paid-community membership. Canceling renewal retained access through
the paid period. A signed terminal cancellation event then produced zero active
entitlements, one revoked entitlement, and zero active paid memberships; the
order UI reported ended access, the product became purchasable again, and the
community returned to its membership gate. Replaying the older paid-invoice
event after cancellation did not restore access, proving out-of-order delivery
cannot override a terminal state. The production webhook endpoint subscribes
to Checkout completion, asynchronous payment success, subscription updates,
subscription deletion, and paid invoices with no required event missing.

All MVP release gates are satisfied. Provider activations and end-state
capabilities listed above remain deliberately after MVP rather than hidden
release blockers.
