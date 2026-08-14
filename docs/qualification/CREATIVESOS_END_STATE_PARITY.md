# CreativesOS desired end-state parity ledger

This ledger is the canonical implementation and release boundary for the
standalone CreativesOS projection. It reconciles the current product doctrine,
the Stitch visual reference, the checked-in qualification matrices, and the
implemented code. A capability is not complete merely because a route renders.

## Product boundary

CreativesOS owns the creator's identity, intellectual property, content and
creative production, distribution, audience relationships, campaigns,
communities, learning products, commerce, and monetization. It must remain a
useful standalone application. Its projection kernel exposes a narrow,
signed, auditable integration surface so a paired UMH installation can inspect,
propose, approve, and coordinate work without becoming a runtime dependency.

The desired end state also includes:

- owned and rented distribution rails with one provider-neutral job model;
- a unified relationship inbox and customer timeline across supported channels;
- free and paid communities with realtime rooms and governed meeting AI;
- durable commerce that separates platform revenue from creator proceeds;
- reviewable automation, AI, consent, moderation, privacy, and audit evidence;
- mobile-first Stitch visual parity and fully usable desktop layouts.

The obsolete direct-PostgreSQL projection transport is not part of this end
state. The standalone-safe signed HTTPS bridge and durable outbox are the
current architecture.

## Competitive acceptance overlay

This ledger records functional implementation and release evidence. Every
capability inspired by an established product category also inherits
[`PRODUCT_WIDE_COMPETITIVE_STANDARD.md`](../PRODUCT_WIDE_COMPETITIVE_STANDARD.md):

- first meet the standalone professional-quality bar for the bounded normal
  workflow;
- then prove that the connected CreativesOS workflow is materially faster or
  requires materially fewer manual handoffs;
- never infer competitive parity from a rendered route, passing API test, or
  the fact that several features share one application.

Accordingly, `verified_complete` below is not automatically a claim that the
capability has reached `parity_met` or `connected_advantage_proven`. Those
competitive states require a dated golden-journey benchmark and side-by-side
field evidence.

## Completion vocabulary

| State | Meaning |
| --- | --- |
| `verified_complete` | Implemented and covered by repeatable unit/contract, browser, and production evidence appropriate to the capability. |
| `implemented_unqualified` | Product path exists, but the end-to-end or role-specific proof is incomplete. |
| `provider_pending` | Native boundary is fail-closed; live completion requires approved external credentials or review. |
| `umh_pending` | Projection side is ready; paired UMH-side configuration or round trip is outside this repository. |
| `decision_pending` | A binding product, policy, or legal decision is required before publication. |

## Capability parity

| Capability | Native implementation target | Current state | Evidence still required |
| --- | --- | --- | --- |
| Identity and tenancy | Separate registration/login, Clerk identity binding, business authority, intended-route return | `verified_complete` (native); production multi-identity evidence pending | Visitor and signed-in production flows pass, while the isolated PostgreSQL browser matrix proves creator, owner, operator, moderator, buyer and learner authority. A production repeat with separately controlled identities requires authorized external test accounts rather than more native code. |
| Feed and stories | Every supported text/image/video/story format; mention navigation; reaction/comment/save/repost rules | `verified_complete` | PostgreSQL API lifecycle plus desktop/mobile post, story-media, following and reload journeys pass; external social publishing is tracked under Distribution |
| Profiles | Public profile, edit profile, follow graph, clickable/slidable six-tab viewport, private owner data outside public tabs | `verified_complete` | Desktop/mobile six-tab navigation, profile-link reload, follow graph and owner/non-owner mutation denial pass |
| Marketplace discovery | Search/filter, stable product links, save/cart state, creator storefront | `verified_complete` | Desktop/mobile search and empty states plus account-scoped save/cart persistence and stable dynamic-route handling pass |
| Platform commerce | Order lifecycle, verified payment event, platform fees/revenue, refund/dispute-safe transitions | `verified_complete` | Checkout, subscriptions, signed webhooks, full refund/reversal, dispute revocation, destination-transfer recovery, won-dispute restoration, crash recovery and zero-residue reconciliation are production-qualified |
| Creator proceeds | Creator-owned Connect onboarding, allocation ledger, payout readiness, separation from platform revenue | `verified_complete` (native); `provider_pending` (successful payout) | Connected-account onboarding, allocation, transfer reversal/restoration, dual signed webhooks, remediation sync and failed-payout history are production-qualified; the creator must replace the errored Stripe sandbox bank before a successful provider payout can be proved. |
| Communities | Discover, join gate, free/paid membership, channels, posts, replies, polls, events, owner/moderator controls | `verified_complete` | Join gate, member/owner/moderator authorization, channel access, search/context actions and course-entitlement auto-membership pass |
| Realtime conference rooms | Join/leave, attendance, consent, recording, transcript lineage, notes/actions, participant intelligence | `verified_complete` (native); `provider_pending` (transcription and realtime AI) | LiveKit join/leave and private recording are production-qualified; native transcript ingest, notes/actions, consent and intelligence boundaries pass, while transcription and realtime-agent worker round trips require their providers. |
| Role-scoped meeting AI | Explicit role admission, bounded guest context, reviewable suggestions, stop budgets, live AI participation | `provider_pending` | Realtime AI and model-provider round trip; role/consent enforcement browser proof |
| Learning | Course creation, entitlement, lesson progress, assessment, completion and unlock rules | `verified_complete` | Owner/learner curriculum, answer redaction, failed/passed assessment, progress, denial and community unlock pass on both qualification actors |
| Business workspace | Campaigns, offers, courses, contacts, documents, revenue and performance | `verified_complete` | Campaign, deliverable, metric, draft, contact and document create/edit/read lifecycles plus cross-tenant denial pass |
| Distribution | Provider-neutral drafts, scheduling/queueing, attempts, retry/cancel, immutable delivery evidence | `verified_complete` (native); `provider_pending` (external) | Native scheduling, cancellation, retry and exactly-once receipts pass; mixed jobs remain honestly `needs_connection`; each external channel still needs its own live round trip |
| Relationship Hub | Canonical unified inbox, native DM bridge, CRM timeline, consent, assignment, tasks, notes, tags and merge review | `verified_complete` (native) | Native direct/group UI reload, tenant isolation, every CRM operation, quotas, retention and privacy context pass; external channel adapters remain provider gates |
| ManyChat-style automation | Comment/DM keyword triggers, matching modes, cooldown, opt-out, approval, retry and receipts | `verified_complete` (native) | UI authoring/activation/execution/activity and native comment/DM triggers, public reply, cooldown/idempotency, opt-out, approval, retry and receipts pass |
| AI relationship copilot | Governed suggestions, evidence citations, injection boundary, human review and execution re-check | `provider_pending` | Native review/state proof plus model-provider inference round trip |
| Cloned voice | Attestation, consent, exact-script approval, disclosure, private artifact lifecycle and revocation | `provider_pending` | Voice-provider enrollment/generation/delivery/revocation/deletion proof |
| CutStudio | Durable multitrack editing, captions, audio/color/brand controls, review, rendering, multicam and reusable asset lineage | `verified_complete` (provider-independent web runtime); `not_benchmarked` (competitive) | The bounded creator workflow now includes Broadcast multicam handoff, synchronized angle switching, private edit proxies and original-source render lineage. Competitive parity still requires the locked same-source human review benchmark; translated captions, provider transcription/diarization, vision/model assistance and scalable 4K worker evidence remain external or scale gates. |
| Broadcast | Multi-studio live production, scenes/sources/audio, collaboration, recording, resilient delivery, field capture and operator evidence | `verified_complete` (provider-independent web runtime); `not_benchmarked` (competitive); `provider_pending` (remote/external) | The bounded workflow now includes program/preview multiview, transition rendering, native audience widgets, destination-specific landscape/portrait/square variants, a phone operator surface, and secure native-capable field-node pairing, telemetry, continuity and director controls. Competitive parity still requires the locked same-show human review benchmark; a distributable Android/iOS capture shell and real-device/network endurance run are device gates, while remote guests, external live destinations and regional encoder failover remain provider or scale gates. |
| Connected creation loop | Completed Broadcast programs, isolated sources and markers open directly as lineage-preserving CutStudio projects without export/re-upload | `verified_complete` (native) | One generated source now passes the mobile and desktop golden journey: private Broadcast program and isolated track, idempotent CutStudio handoff, transcript correction, deterministic highlights, kinetic-caption render, public distribution promotion, native publication, post-scoped comment automation, second-user keyword comment, public reply, DM and post analytics. External destinations remain provider gates. |
| Moderation and safety | Reports, scoped queue, membership/content enforcement, audit and recovery | `verified_complete` (native) | Self-report rejection, creator denial, reporter submission, administrator queue/review and member moderation lifecycle pass |
| Privacy and retention | Complete bounded export, deletion, retention expiry, consent and private-media cleanup | `verified_complete` (native) | Scoped export, reversible scheduling, ownership preflight, local erasure, shared-message redaction, identity tombstone and durable evidence pass |
| Operations | Health/readiness, usage/capacity, provider state, alerts, recovery, backup/restore and migration parity | `verified_complete` | Local migration/recovery/security/capacity gates and v305 production readiness pass; production migrations now use a transaction-scoped advisory lock safe for the database transaction pooler |
| Projection-side UMH bridge | Signed scoped ingress, replay/idempotency/tenant controls, approvals, audit and durable outbox | `verified_complete` (projection side) | Invalid-signature denial, replay/idempotency, tenant authority, local approval and duplicate-decision rejection pass; paired round trip remains in UMH pairing |
| UMH pairing | Cockpit discovery, capability negotiation, command/evidence exchange | `umh_pending` | UMH-side binding and live signed round trip |
| Legal publication | Terms, privacy, creator/seller/payment/AI/recording/community policies | `decision_pending` | Counsel-approved text, policy owner and effective dates; placeholders must not publish |

## Visual and interaction parity

Every reference screen must be checked at the intended mobile viewport and a
desktop viewport. Completion requires all of the following, not approximate
styling:

- shared dark monochrome tokens and blue accent across every route;
- persistent, route-correct application navigation outside auth and public
  trust/legal surfaces;
- no visible horizontal scrollbars while pointer, touch, wheel, keyboard, and
  tab activation continue to work;
- selected states for navigation, reactions, repost, saves, profile tabs,
  marketplace filters, community membership, and automation status;
- accessible names, focus indicators, logical focus order, dialog focus
  containment, reduced-motion support, and no serious Axe violations;
- explicit loading, empty, permission-denied, provider-disabled, recoverable
  error, and destructive-confirmation states;
- responsive content hierarchy, safe-area spacing, touch targets, readable type,
  and no clipped controls at 390x884;
- no stale CreatorOS naming or placeholder identities on user-facing surfaces.

## Release evidence checklist

- [x] Unit, contract, integration, TypeScript, production build and bundle gates pass locally.
- [x] Empty PostgreSQL migration qualification passes locally across all 83 migrations; the last independently retained production evidence remains v305 at 80 migrations and is not silently upgraded by this local result.
- [x] Secret scan, dependency audit, backup/restore and local capacity checks pass.
- [x] The 124-execution isolated PostgreSQL browser matrix (62 journeys on mobile and desktop) covers every provider-independent capability and material local role transition above.
- [x] Browser and API lifecycle assertions prove mutations persisted after reload/refetch; controls are not counted as evidence by themselves.
- [x] Mobile and desktop accessibility sweeps pass for the primary routes currently in the browser matrix; destructive and provider dialogs remain separately gated.
- [x] All 74 Stitch references are paired with an implemented route/state or an explicit superseding decision.
- [x] Production field tests repeat the safe signed-in application surfaces; LiveKit join/leave, AI quota handling, Stripe connected-account delivery, refund/reversal, dispute recovery/restoration and failed-payout persistence retain their current evidence, and the v305 live authenticated checks cover Broadcast, CutStudio, Distribution, automations, profile, marketplace search/product routing and communities with clean runtime logs. The sweep directly proves route-correct active navigation across the five primary destinations plus Broadcast, CutStudio and Privacy settings. The unchanged anonymous auth entry additionally retains its Lighthouse evidence at 96 performance and 100 accessibility.
- [x] Provider-disabled states are honest: mixed native/external distribution remains `needs_connection`, retries preserve one native receipt, and unconfigured realtime/AI/channel surfaces fail closed.
- [ ] Provider credentials, legal publication, UMH-side pairing and irreversible production actions remain explicit handoff gates.

## 2026-08-14 local creation-studio qualification

This section records local evidence for the current worktree without rewriting
older production evidence:

- 74 unit/integration files and 302 tests passed, followed by TypeScript checks,
  production builds, Worker validation and bundle budgets;
- 124 isolated PostgreSQL browser executions passed across mobile and desktop,
  including secure field-node pairing and replay rejection, remote director
  configuration, phone operation, live multiview/widgets/transitions,
  multicam angle rendering and proxy/original-lineage behavior;
- real FFmpeg qualification produced and probed simultaneous landscape and
  portrait outputs from one program, in addition to the existing private
  CutStudio render paths;
- all 83 migrations passed from an empty database, and a backup created from
  that schema restored with the required tables and no orphaned direct
  messages;
- the source-secret scan covered 574 tracked files, the production dependency
  audit reported zero vulnerabilities, and the 200-request/20-concurrency
  capacity probe completed with zero failures.

This is provider-independent local release evidence. It is not evidence of a
new production deployment, a native phone-binary field test, an authorized
competitor benchmark, live third-party destinations, remote guests, regional
encoder failover or external AI/transcription behavior.

## External activation register

The remaining Stripe gate is a successful creator payout after the creator replaces
the connected sandbox account's errored test bank; platform payout failure events and
history are already proven. Other gates are Meta Instagram,
Messenger and WhatsApp review and credentials; X access; any additional social
publishing provider; restored model quota; cloned voice; realtime transcription and
AI workers; and paired UMH configuration. TikTok and LinkedIn messaging remain
unsupported unless an official approved API exposes the required capability.
No private-session scraping is an acceptable substitute.
