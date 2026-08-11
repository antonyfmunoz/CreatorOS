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
| Identity and tenancy | Separate registration/login, Clerk identity binding, business authority, intended-route return | `implemented_unqualified` | Role-based production browser proof for visitor, creator, owner, operator, moderator, buyer and learner |
| Feed and stories | Every supported text/image/video/story format; mention navigation; reaction/comment/save/repost rules | `implemented_unqualified` | Mutation-and-refresh browser proof, media upload proof, owner/non-owner permission proof |
| Profiles | Public profile, edit profile, follow graph, clickable/slidable six-tab viewport, private owner data outside public tabs | `implemented_unqualified` | Mobile/desktop interaction, keyboard, overflow and non-owner browser proof |
| Marketplace discovery | Search/filter, stable product links, save/cart state, creator storefront | `implemented_unqualified` | Search result assertions, product identity regression, persistence and empty/error states |
| Platform commerce | Order lifecycle, verified payment event, platform fees/revenue, refund/dispute-safe transitions | `provider_pending` | Stripe test-mode checkout/webhook/refund end-to-end evidence |
| Creator proceeds | Creator-owned Connect onboarding, allocation ledger, payout readiness, separation from platform revenue | `provider_pending` | Connected-account charge/allocation/refund and payout-status production test |
| Communities | Discover, join gate, free/paid membership, channels, posts, replies, polls, events, owner/moderator controls | `implemented_unqualified` | Full member/moderator/owner browser journey and paid entitlement proof |
| Realtime conference rooms | Join/leave, attendance, consent, recording, transcript lineage, notes/actions, participant intelligence | `provider_pending` | LiveKit worker and live room recording/transcription/realtime-agent proof |
| Role-scoped meeting AI | Explicit role admission, bounded guest context, reviewable suggestions, stop budgets, live AI participation | `provider_pending` | Realtime AI and model-provider round trip; role/consent enforcement browser proof |
| Learning | Course creation, entitlement, lesson progress, assessment, completion and unlock rules | `implemented_unqualified` | Creator/learner end-to-end browser proof and entitlement denial proof |
| Business workspace | Campaigns, offers, courses, contacts, documents, revenue and performance | `implemented_unqualified` | Owner/operator create-edit-refresh journeys and cross-tenant denial tests |
| Distribution | Provider-neutral drafts, scheduling/queueing, attempts, retry/cancel, immutable delivery evidence | `implemented_unqualified` | Native queue lifecycle browser proof; each external channel remains separately gated |
| Relationship Hub | Canonical unified inbox, native DM bridge, CRM timeline, consent, assignment, tasks, notes, tags and merge review | `implemented_unqualified` | Authenticated native field test across every operation and tenant-boundary denial |
| ManyChat-style automation | Comment/DM keyword triggers, matching modes, cooldown, opt-out, approval, retry and receipts | `implemented_unqualified` | UI authoring/activation/run/retry browser proof across native comment and DM events |
| AI relationship copilot | Governed suggestions, evidence citations, injection boundary, human review and execution re-check | `provider_pending` | Native review/state proof plus model-provider inference round trip |
| Cloned voice | Attestation, consent, exact-script approval, disclosure, private artifact lifecycle and revocation | `provider_pending` | Voice-provider enrollment/generation/delivery/revocation/deletion proof |
| Moderation and safety | Reports, scoped queue, membership/content enforcement, audit and recovery | `implemented_unqualified` | Reporter/moderator/owner browser journeys and unauthorized denial assertions |
| Privacy and retention | Complete bounded export, deletion, retention expiry, consent and private-media cleanup | `implemented_unqualified` | Browser export/delete journey, artifact inspection and scheduled-expiry proof |
| Operations | Health/readiness, usage/capacity, provider state, alerts, recovery, backup/restore and migration parity | `verified_complete` | Local migration/recovery/security/capacity gates and v209 production readiness, security and capacity probes pass; repeat after every release |
| Projection-side UMH bridge | Signed scoped ingress, replay/idempotency/tenant controls, approvals, audit and durable outbox | `implemented_unqualified` | Projection-side browser/API approval proof and paired round trip |
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
- [x] Empty PostgreSQL migration and v209 production migration/release-command parity pass.
- [x] Secret scan, dependency audit, backup/restore and local capacity checks pass.
- [ ] Browser journeys cover every capability and every material role transition above.
- [ ] Browser assertions prove mutations persisted after a reload, not only that controls were clickable.
- [x] Mobile and desktop accessibility sweeps pass for the primary routes currently in the browser matrix; destructive and provider dialogs remain separately gated.
- [x] All 74 Stitch references are paired with an implemented route/state or an explicit superseding decision.
- [x] Production field tests repeat the safe signed-in settings, profile, marketplace/product, community and Relationship Hub journeys against v209; role-changing and provider journeys remain explicitly gated below.
- [ ] Provider-disabled states are honest and cannot create inconsistent native data.
- [ ] Provider credentials, legal publication, UMH-side pairing and irreversible production actions remain explicit handoff gates.

## External activation register

The remaining external gates are Stripe live/test round trips; Meta Instagram,
Messenger and WhatsApp review and credentials; X access; any additional social
publishing provider; model inference; cloned voice; realtime transcription and
AI workers; and paired UMH configuration. TikTok and LinkedIn messaging remain
unsupported unless an official approved API exposes the required capability.
No private-session scraping is an acceptable substitute.
