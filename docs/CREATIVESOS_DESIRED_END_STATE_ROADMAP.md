# CreativesOS desired-end-state roadmap

Last reconciled: 2026-08-15

## Purpose

This is the canonical execution roadmap from the current CreativesOS production
baseline to the desired standalone creator operating system. It combines the
native social product, creator business, media production, distribution,
audience relationships, communities, commerce, UGC, learning, analytics and
the projection-side UMH integration into one dependency-ordered program.

It does not treat a rendered route as completion and it does not treat several
features sharing one application as competitive superiority. Every capability
must pass four independent gates:

1. **Native implementation:** the provider-independent product contract,
   persistence, permissions, recovery and user experience exist.
2. **External activation:** every required provider completes an authorized
   live round trip and fails closed when unavailable.
3. **Production qualification:** migrations, security, browser journeys,
   observability, recovery and real production identity are evidenced.
4. **Competitive qualification:** a locked, same-input comparison proves
   standalone parity and then measures the connected advantage.

## Desired end state

CreativesOS is the standalone operating system through which a creative or
creative team can:

- plan, design, record, edit, organize and approve creative work;
- host owned media and distribute it to owned and rented channels;
- publish into a native social network and grow an owned audience;
- centralize conversations, customer context and safe automation;
- operate communities, learning products, meetings and live events;
- sell products, memberships, sponsorships and collaborative UGC work;
- attribute attention and revenue back to the exact content and relationship;
- govern identity, tenancy, rights, consent, safety, retention and recovery;
- remain fully useful without UMH while exposing a narrow, signed projection
  interface that a paired UMH cockpit can inspect and coordinate.

The product advantage is not simply "all in one." It is preservation of the
same identity, asset, permission, relationship, commercial and evidence
lineage across the entire creator lifecycle.

## Current baseline

### Functionally qualified native foundations

- Identity, login/registration, business tenancy and role enforcement.
- Native text, image, audio and video posts; stories; profiles; follows;
  mentions; comments; reactions; saves; polls and one-level reposts.
- Marketplace discovery, one-time and recurring commerce, entitlements,
  communities, courses and buyer subscription management.
- Platform-revenue and creator-proceeds separation with durable Stripe event
  and financial-recovery handling.
- Native UGC portfolio, brief, application, selection, private revision,
  approval, performance and earnings lifecycle.
- Relationship Hub inbox, customer timeline, consent, assignment, notes,
  tasks, tags, identity merge review and provider-neutral delivery jobs.
- ManyChat-style native comment and DM automation with cooldowns,
  idempotency, opt-out, approvals, retries and receipts.
- Distribution drafts, scheduling, queueing, cancellation, retry and immutable
  provider-neutral attempts.
- Communities, learning and consent-governed realtime-room foundations.
- CutStudio's bounded web editing, review, render and distribution workflow.
- Broadcast's bounded browser production, recording, field-control and
  CutStudio handoff workflow.
- The native connected creation loop from Broadcast through CutStudio,
  Distribution, native publication, automation, messaging and performance.
- Moderation, privacy/export/deletion, readiness, migrations, backup/recovery,
  capacity controls, exact source/migration release identity and projection-side
  signed UMH command/outbox boundaries.
- Media Cloud processing/rendition/playback contracts, a unified governed asset
  library, production planning, first-party analytics/attribution, audience and
  notification foundations, discovery governance, and rights/trust workflows.
- Audience, Podcast, Design, Creator Site, Sponsorship, Affiliate, Booking,
  Ticketing and marketplace-operations studios with isolated mobile/desktop
  lifecycle evidence.
- Community onboarding and evidence-based gamification, native social safety,
  seller/sample logistics, and a repeatable competitive benchmark evidence
  register whose claims remain honestly `not_benchmarked` until run.
- An installable privacy-safe PWA shell, scoped public read API, opaque
  pagination, one-time API/webhook credentials, signed retry/dead-letter
  webhooks, durable distributed API rate windows and a tenant-scoped operations
  control plane with published SLOs, error budgets, usage and cost boundaries.
- Delegated OAuth applications with atomic one-time-code and refresh-token
  rotation, typed TypeScript SDKs, expiring isolated sandboxes, reviewed public
  app listings, an administrator review console and full revocation.
- A versioned portability package and operator workspace for atomic,
  tenant-scoped, idempotent product, course, contact and automation migrations,
  plus audience CSV, podcast RSS and governed media migration paths.

### Implemented but not competitively proven

All current comparison families remain `not_benchmarked`. CutStudio,
Broadcast, native UGC, social, communities, commerce, Relationship Hub,
automation, Distribution and the connected loop have functional evidence but
do not yet have the locked side-by-side operator evidence required for a
`parity_met` or `connected_advantage_proven` claim.

### Production closure evidence

- Protected workflow run
  [`31965242974`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/31965242974)
  deployed exact `main` merge commit
  `e7642ed2001f44d06353cddd1cdf6ee9ba085e68` from an immutable `git archive`
  snapshot after repeating 111 files / 426 tests, TypeScript, the production
  build, bundle and Worker gates, all 104 migrations, and all 180 Pixel
  7/desktop Chromium executions.
- The release made a completed private backup, hydrated the immutable snapshot
  from its exact lockfile without lifecycle scripts, verified the migration
  ledger before and after deployment, completed Fly's release command, and
  rolled image `deployment-01M05Z0BB8D9CE1J40H49AJ4ED` across both machines.
- Independent live checks prove `/api/health` and `/api/ready` are healthy with
  no release blockers. `/api/release` reports build
  `20260816T185750Z-fb2292d2b7a3`, the exact merge commit, fingerprint
  `fb2292d2b7a34f96440f28e43148403f18d5d934870b3804eda5a67de24506fc`,
  `sourceDirty: false`, verified identity, and 104/104 migration parity.
- Protected PR workflow
  [`31964459158`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/31964459158)
  compiles the synchronized unsigned Android debug shell and iOS simulator
  shell in addition to the core, database, browser and CodeQL gates.
- Fly release `v312` established the desired-state native production baseline
  from source commit
  `6ee7d88ac1e81d127745fe46750d7ad334de5f8d` from the protected `main`
  deployment workflow.
- The workflow repeated 110 files / 413 tests, TypeScript, production build,
  bundle and Worker gates, all 103 migrations, backup/restore, security and
  capacity checks, and all 178 Pixel 7/desktop Chromium executions before
  deployment.
- At v312, `https://creativesos.net/api/health`, `/api/ready`, and
  `/api/release` returned healthy, release-ready and exact-source evidence; the
  production database was at all 103 migrations and both IAD machines served
  the same release image.
- Anonymous field checks prove auth routing, separate login/registration,
  protected-route redirection, protected-API `401` boundaries, public discovery
  contracts, production branding, the creation-and-distribution copy, and
  security headers on the current clean release. A fresh authenticated
  route repeat still requires an authorized signed-in browser session; older
  authenticated production evidence remains recorded in the parity ledger.
- After this evidence was merged, the same protected workflow produced the
  documentation-only Fly release `v313` from merge commit
  `1b0c340bd3fa74ae41545363df18c07bf2304614`. The live `/api/release` endpoint,
  rather than a hard-coded roadmap version, is the canonical current runtime
  identity.

### External or decision gates already known

- Successful creator payout after the connected Stripe sandbox bank is fixed.
- Meta, Instagram, Messenger, WhatsApp, TikTok, X and additional publishing
  or messaging approvals and credentials.
- External live destinations, remote guest transport and regional encoders.
- Realtime transcription, meeting AI, relationship AI and cloned voice.
- UMH-side pairing and a signed bidirectional production round trip.
- Binding legal entity, launch-region, marketplace, tax, copyright, privacy,
  AI-data-use and counsel decisions.

### Remaining native depth or external evidence

- Provider-backed adaptive packaging/transcoding, global CDN behavior and
  regional media/realtime failover remain activation and scale evidence, not
  missing local product contracts.
- Native iOS/Android shells, lifecycle/deep-link handling, explicit push
  consent, encrypted device-token custody and bounded background wake are
  implemented and their unsigned Android/iOS projects compile in protected CI.
  Provider signing/delivery, sustained background capture/upload,
  physical-device and app-store qualification remain external/device gates.
- The developer ecosystem and portability foundation are native-qualified;
  public package-registry publication and third-party adoption remain external
  release evidence rather than missing product contracts.
- Every comparison family still needs authorized same-input operator runs.
  Implemented benchmark records intentionally remain `not_benchmarked`.
- Provider approvals, production credentials, UMH-side pairing, legal decisions
  and irreversible launch actions remain explicit external gates.

## Current-to-end-state transition matrix

| Product family | Current state | Next material move | Desired end state |
| --- | --- | --- | --- |
| Identity and tenancy | Native-qualified | Repeat with independently controlled production identities; extend every new domain through the same authority model | One creator and business identity with explicit roles across every instrument |
| Native social | Publishing, interaction, playback telemetry, Following/For You and chronological discovery, governed notifications and safety are native-qualified; competitively unbenchmarked | Run authorized daily-use benchmark and close only evidenced workflow gaps | Dependable owned social network whose engagement becomes reusable audience and commercial context |
| Media hosting | Provider-neutral Media Cloud, renditions, jobs, authorization, playback telemetry and portability are locally qualified | Activate production processing/CDN adapters and run volume, deletion and migration exercises | Secure live/VOD media platform for every CreativesOS instrument |
| Asset management | Unified DAM, collections, search, versions, rights and cross-instrument lineage are locally qualified | Repeat with production storage and representative large libraries | One governed creative library from source through every derivative and publication |
| Planning | Unified production planner, calendar, dependencies, assignments and connected work objects are locally qualified | Production team field run and notification-provider activation | Idea-to-retrospective operating plan across teams and channels |
| CutStudio | Provider-independent bounded workflow qualified; parity unbenchmarked | Benchmark and close material creator-workflow gaps; add justified provider/scale capabilities | Professional creator editor with a measured connected advantage |
| Broadcast | Provider-independent bounded workflow qualified; destinations/device scale gated | Activate guests/destinations, native field capture, endurance and failover; benchmark | Professional studio and IRL production system feeding the rest of CreativesOS directly |
| Design | DesignStudio brand kits, canvases, variants, review and shared-asset handoff are locally qualified | Operator benchmark and provider-backed rendering depth where justified | On-brand thumbnails, covers, carousels, social graphics and campaign collateral |
| Distribution | Provider-neutral orchestration qualified | Activate each channel and verify receipt, revocation, analytics and recovery | One governed master published and measured across supported destinations |
| Audience and email | Audience identity, consent, segments, forms, campaigns, sequences, preferences and delivery adapter contracts are locally qualified | Activate email/push providers and prove deliverability, suppression and reply handoff | Owned audience platform independent of social algorithms |
| Relationship Hub | Native-qualified; external channels provider-gated | Activate official adapters and benchmark omnichannel operations | Canonical customer timeline across native and supported external conversations |
| Automation and AI | Native automation qualified; model/voice/realtime outcomes gated | Activate governed inference, transcription and voice; benchmark intervention and recovery | Reviewable human/AI operations using shared relationship and commercial context |
| Search and recommendation | Permission-aware discovery candidates, explainable ranking, safety filters, versioning and rollback are locally qualified | Add justified production index backends and run quality/fairness experiments at volume | Explainable, safe and measurable discovery across creators, content, products and communities |
| Notifications | Governed event routing, preferences, quiet hours, batching, digests, suppression and receipt contracts are locally qualified | Activate email/push adapters and production delivery evidence | Reliable preference-governed in-app, email and push communication |
| Analytics and attribution | Canonical events, playback telemetry, identity links, attribution and experiments are locally qualified | Production-volume data-quality and decision-usefulness field evidence | Trustworthy content-to-relationship-to-revenue intelligence |
| Marketplace and commerce | Seller/storefront, bundles, promotions, support, fulfillment and mature Stripe recovery paths are locally qualified | Provider/tax/legal activation and competitive operator benchmark | Durable creator storefronts with correct access, support, earnings and recovery |
| Creator payouts | Allocation/recovery qualified; successful provider payout pending | Replace failed sandbox bank and prove successful payout | Creator-controlled onboarding, proceeds, payout status and remediation |
| UGC | Native lifecycle qualified; competitive benchmark and external attribution pending | Run locked benchmark; add only material logistics, attribution and settlement gaps | Accountable brand-creator production connected to assets, distribution and earnings |
| Sponsorships | Deal pipeline, rights, deliverables, approvals, invoices, reporting and renewal are locally qualified | Provider-backed invoice/funding evidence and operator benchmark | Sponsorship operation from prospect through renewal and measured outcome |
| Affiliates and referrals | Programs, links, attribution, commission, reversal, fraud review and payout ledger are locally qualified | Funded payout/provider evidence and abuse-volume exercise | Governed partner and customer-led growth tied to commerce evidence |
| Communities and learning | Membership, gated access, channels, learning, events, onboarding, gamification, moderation and rooms are locally qualified | Competitive benchmark and provider-backed realtime AI/guest depth | Paid/free member experience joining content, learning, meetings and commerce |
| Meetings and events | Rooms, recording, scheduling, booking and ticketing are locally qualified; external transcription, guests and role-scoped AI remain gated | Activate transcription, remote guests and governed role-scoped AI, then run the meeting benchmark | Consent-governed meetings and paid events that automatically create usable work |
| Podcasts | Shows, episodes, chapters, RSS, transcripts, access and analytics are locally qualified | Production feed validation, directory/provider activation and competitive benchmark | Audio/video podcast hosting and growth using Broadcast, CutStudio and Media Cloud |
| Creator site | Page composition, link hub, storefront, SEO/capture/attribution and custom-domain contracts are locally qualified | Production DNS/domain automation and operator conversion benchmark | Owned branded destination for content, community and commerce |
| Rights and safety | Rights, releases, licenses, provenance, takedown/counter-notice/appeal and safety workflows are locally qualified | Counsel decisions and production operational exercises | Enforceable provenance, usage authority and public-platform trust operations |
| Mobile | Responsive PWA plus generated iOS/Android shells, safe deep links, lifecycle/network recovery, encrypted push-device registration and bounded background wake are qualified; protected CI compiles unsigned Android and iOS shells | Add provider signing/delivery, sustained OS background transfer/capture, physical-device endurance and app-store evidence | Reliable iOS/Android creation, consumption, messaging and field production |
| Operations and scale | Native control plane, immutable release source and exact clean production identity are qualified at commit `e7642ed` with all 104 migrations | Repeat authorized signed-in field evidence, then exercise regional media/realtime resilience and production volume | Published SLOs, bounded cost, tested recovery and safe multi-tenant scale |
| UMH integration | Projection side qualified | Pair from UMH and prove signed bidirectional round trip | Cockpit coordination without surrendering standalone authority |
| Developer ecosystem | Scoped API/OpenAPI, delegated OAuth, typed SDKs, sandbox tenants, reviewed marketplace listings, signed webhooks and full revocation are locally qualified | Publish packages and repeat with independently controlled third-party apps | Safe third-party extension and integration marketplace |
| Data portability | Audience CSV, podcast RSS, Media Library ingest and versioned cross-domain migration packages are locally qualified | Run representative imports from selected competitor exports and verify reconciliation at volume | Reversible movement into and out of canonical assets, audiences, offers, courses, contacts and automations |
| Legal publication | Decision pending | Resolve operator/counsel inputs and publish versioned approved policies | Launch-region-appropriate enforceable product, creator and marketplace terms |

## Dependency map

```text
Identity / tenancy / permissions / audit
                  |
                  v
Assets + Media Cloud + rights + event telemetry
                  |
        +---------+----------+
        |                    |
        v                    v
Planning / Design /      Audience / search /
CutStudio / Broadcast    recommendation / notifications
        |                    |
        +---------+----------+
                  v
Native social / podcasts / communities / learning / sites
                  |
                  v
Distribution / relationships / automation / commerce
                  |
                  v
Providers + live production round trips
                  |
                  v
Competitive benchmarks + mobile/scale qualification
                  |
                  v
Developer ecosystem + selective owned infrastructure
```

Shared capabilities must be implemented once and reused. Podcast video,
course video, UGC submissions, social video, Broadcast recordings and
CutStudio renders must not create six incompatible media systems.

## Phase 0 — Preserve the qualified baseline

**State:** substantially complete; continuously enforced.

### Work

- Keep the full type, build, test, migration, security, backup, browser,
  accessibility, capacity and deployment gates mandatory.
- Keep production releases manual, main-only, serialized and protected by a
  GitHub production environment; require the exact candidate to repeat its
  code, migration and two-viewport browser gates before release.
- Require a completed private backup receipt before any production migration.
- Require every production image to expose its non-secret source fingerprint,
  commit, dirty-tree state, build time and exact migration-ledger parity; fail
  readiness and deployment verification closed when they differ.
- Preserve tenant isolation and deny cross-business access for every new table,
  route, worker and object-store key.
- Keep provider-disabled states explicit and fail closed.
- Preserve the projection boundary: CreativesOS owns local state and UMH may
  coordinate only through signed, scoped, auditable contracts.
- Add every new product family to the critical-journey and competitive
  qualification matrices before it can be called complete.

### Exit gate

No new roadmap phase may weaken the current production readiness, privacy,
commerce, automation, connected-creation or projection evidence.

## Phase 1 — Shared creator-platform foundations

**Priority:** P0. Complete provider-independent contracts before activating
new external providers.

**Current worktree state:** provider-independent implementation and focused
mobile/desktop lifecycle qualification complete; production-scale adapters and
competitive proof remain separate gates.

### 1.1 Media Cloud

- Add canonical media assets, sources, derivatives, renditions, tracks,
  captions, thumbnails, playback identities and processing jobs.
- Support direct and resumable uploads, checksum validation, inspect/scan,
  asynchronous processing, retry, cancellation and dead-letter recovery.
- Define adaptive HLS/DASH playback, signed/private access, paid entitlement,
  allowed-origin and deletion/retention contracts.
- Add player session telemetry for startup, buffering, bitrate, errors,
  watch time, completion, replay and abandonment.
- Keep originals and ownership portable; no video provider becomes the system
  of record.

**Acceptance:** one source upload produces authorized adaptive playback,
captions/thumbnails, playback evidence, deletion evidence and a reversible
provider migration record.

### 1.2 Digital Asset Manager

- Build a creator-facing asset library with search, collections, tags,
  duplicates, versions, ownership, business access and usage history.
- Preserve derivation lineage across Broadcast, CutStudio, DesignStudio, UGC,
  Distribution, products, courses and posts.
- Attach rights, consent, license territory/duration and expiration state.

**Acceptance:** an authorized user can find any asset, identify its source and
derivatives, see everywhere it is used and prevent new use when rights expire.

### 1.3 Event, analytics and attribution platform

- Define versioned first-party events for exposure, playback, engagement,
  relationship, funnel, purchase, entitlement and revenue outcomes.
- Add anonymous-to-known identity rules, consent, deduplication, late-event
  handling, attribution windows and source confidence.
- Build creator dashboards for reach, watch retention, audience, conversion,
  revenue and content-to-commercial attribution.
- Add experiment and feature-flag assignments with guardrail metrics.

**Acceptance:** one piece of content can be traced from production through
viewing, conversation, purchase, entitlement, earnings and refund without
manual metric entry.

### 1.4 Content planning and calendar

- Add idea, brief, script, production, edit, review, scheduled, published and
  retrospective states.
- Add assignments, dependencies, due dates, recurring series, channel variants,
  approvals and missed-publication recovery.
- Overlay Broadcast sessions, CutStudio projects, UGC work, events and
  Distribution jobs on one calendar.

**Acceptance:** a team can plan and execute a multi-channel campaign without a
separate spreadsheet or calendar of record.

### 1.5 Audience identity and notification foundations

- Extend canonical relationships with subscribers, interests, segments,
  acquisition source and lifecycle state.
- Add notification events, in-app delivery, email/push adapter contracts,
  preferences, quiet hours, batching, digests, suppression and receipts.
- Ensure consent and latest-state resolution govern every automated send.

**Acceptance:** each audience member has one governed identity and receives
only authorized, deduplicated communications through enabled channels.

### 1.6 Search, recommendation and discovery foundations

- Separate Following, chronological and recommended feed contracts.
- Add candidate generation from graph, declared interests, content metadata
  and behavioral signals.
- Add explainable first ranking, cold-start, diversity, creator fairness,
  sensitive-content filtering and operator rollback.
- Replace bounded database search with an indexed, permission-aware search
  contract that can later accept lexical and semantic backends.

**Acceptance:** recommendation changes are versioned, measurable, reversible
and cannot bypass blocks, permissions, moderation or paid access.

### 1.7 Rights and trust foundation

- Add ownership declarations, contributor releases, music/stock licenses,
  UGC usage grants, expiration and territory restrictions.
- Add takedown, counter-notice, repeat-infringer, appeal and evidence workflows.
- Propagate synthetic-media, cloned-voice and AI provenance through derivatives.

**Acceptance:** CreativesOS can answer who owns an asset, what may be done with
it, where it was published and what must stop after revocation or expiry.

## Phase 2 — Owned audience and publishing suite

**Priority:** P1. Build on Phase 1 rather than creating new silos.

**Current worktree state:** all four native studios are implemented and locally
qualified; external delivery, custom-domain automation, directory activation
and competitive operator proof remain.

### 2.1 Audience Studio

- Subscriber import/export, forms, landing pages, fields, tags and segments.
- Newsletter editor, reusable blocks, sequences, triggers, A/B tests,
  suppression, preference center and engagement/revenue reporting.
- Relationship Hub handoff and human intervention for replies or high-value
  audience activity.

### 2.2 Podcast Studio

- Shows, seasons, audio/video episodes, chapters, artwork, transcripts and
  publishing workflow.
- Standards-compliant RSS, import, redirect, private subscriber feeds and
  destination status.
- Episode analytics, comments, polls, sponsorship markers and member access.

### 2.3 DesignStudio

- Original clean-room canvas editor for thumbnails, covers, carousels, social
  graphics, product art, lead magnets and reusable templates.
- Brand kits, component locking, resize variants, collaboration, review and
  direct Distribution handoff.
- Optional provider adapters for stock media and generative assistance with
  explicit license and provenance records.

### 2.4 Creator Site and Link Hub

- Configurable public creator page, sections, links, embedded media, offers,
  memberships, communities, events and subscriber capture.
- Custom domains, SEO/social metadata, themes, analytics, redirects, consent
  and conversion attribution.

### Exit gate

A creator can establish an owned destination, capture an audience, publish
social/newsletter/podcast content and measure the relationship without relying
on an external social network as the system of record.

## Phase 3 — Creator revenue and commercial operations

**Priority:** P1/P2.

**Current worktree state:** all four provider-independent commercial families
are implemented and locally qualified; funded provider settlement, tax/legal
decisions, abuse-volume exercises and competitive proof remain.

### 3.1 Sponsorship and Brand Deal Studio

- Media kits, audience proof, rate cards, brand pipeline, proposals,
  deliverables, usage rights, exclusivity, contracts and milestones.
- Approval, disclosure, invoicing, payment, performance reporting and renewal.
- Reuse UGC, Campaigns, Documents, Contacts, Distribution and Earnings rather
  than duplicating them.

### 3.2 Affiliate and referral platform

- Programs, applications, approval, links/codes, attribution windows,
  commission rules, recurring commission and payout state.
- Refund/dispute reversals, fraud checks, customer referrals and community
  rewards or leaderboards.

### 3.3 Booking, ticketing and paid events

- Availability, appointment types, capacity, time zones, paid tickets,
  recurring events, waitlists, reminders and cancellation/refund rules.
- Room creation, attendance, replay entitlement and follow-up automation.

### 3.4 Marketplace maturity

- Seller onboarding and policy enforcement, richer storefronts, promotions,
  bundles, trials, discounts, affiliates and dispute/support operations.
- Tax and merchant-of-record behavior must follow explicit operator/counsel
  decisions rather than inferred implementation.

### Exit gate

Creators can operate direct products, recurring membership, UGC, sponsorship,
affiliate and event revenue with correct access, attribution, support and
financial evidence.

## Phase 4 — Complete the existing instruments competitively

**Priority:** continuous after their dependencies exist.

**Current worktree state:** native capability closure and benchmark evidence
capture are implemented. Every comparison remains `not_benchmarked` until an
authorized operator performs the same-input run; no parity claim is inferred.

### Native social

- Maintain the implemented watch-session telemetry, Following/For You and
  chronological contracts, governed notifications, block/mute/restriction and
  creator analytics experiences.
- Benchmark publishing, consumption, interaction, discovery and recovery
  against Instagram, TikTok, YouTube and X normal creator workflows.

### CutStudio

- Close benchmark-discovered normal-workflow gaps.
- Add translated captions, provider-backed transcription/diarization,
  subject-aware reframing and scalable 4K workers when justified by the target
  workflow.

### Broadcast and conference production

- Activate and qualify remote guests, external destinations, long-duration
  capture, native mobile field capture and supervised regional failover.
- Complete role-scoped realtime meeting AI with visible consent and stop
  behavior.

### Communities and learning

- Benchmark onboarding, moderation, discovery, events, learning progress,
  gamification and paid-member operations against Skool, Discord and Circle.

### UGC

- Run the locked Trybe/Billo comparison and close only material normal-workflow
  deficits.
- Add live ad attribution, sample/logistics workflows and funded settlement
  only when required by the chosen operating model.

### Relationship Hub and automation

- Benchmark unified-inbox throughput, assignment, intervention, recovery,
  identity continuity and automation authoring against ManyChat, Front,
  Intercom and respond.io.

### Connected advantage

- Run identical source material through the connected CreativesOS workflow and
  the authorized disconnected comparison toolchain.
- Require at least 25% less active operator time or 50% fewer manual handoffs
  without material loss of quality, safety, reliability or control.

### Exit gate

Every market-facing parity or superiority claim has a dated evidence record,
named workflow, current comparison source, failures, reviewer and measurements.

## Phase 5 — Provider activation and live round trips

**Priority:** after the corresponding native contracts are complete. Provider
activation may run earlier only when it is required to qualify an already-built
critical path.

**Current state:** intentionally deferred by product direction except for
providers already evidenced in production. Every inactive adapter remains
fail-closed and must pass the acceptance template below.

- Video processing/delivery provider for adaptive VOD and live playback.
- Transactional and bulk email delivery, bounce/complaint and reputation loops.
- Web push and native mobile notification delivery.
- Podcast directory connections and destination verification.
- YouTube, Meta, TikTok, X and other approved publishing/analytics adapters.
- Instagram, Messenger, WhatsApp and supported external inbox adapters.
- Remote guest, transcription and realtime-agent workers.
- Relationship AI model provider and cloned-voice provider.
- Broadcast live destinations and encoder health callbacks.
- Successful creator payout with a valid connected-account bank.
- UMH pairing, capability negotiation and signed command/evidence round trip.

### Provider acceptance template

Every provider requires connect, refresh/revoke, inbound, outbound, webhook
signature, idempotency, rate-limit, retry, dead-letter, receipt, privacy export,
deletion and failure-recovery evidence. A credential being present is not an
activation proof.

## Phase 6 — Native mobile, scale and operational maturity

**Priority:** P2, pulled forward where field production or retention requires
it.

**Current worktree state:** installable PWA, web field client, bounded
user-scoped offline post/message/media outbox, server idempotency, restartable
upload intents, generated Capacitor iOS/Android projects, safe deep links,
native lifecycle/network recovery, explicit push consent, encrypted
device-token custody and privacy-safe bounded background wake are implemented
and locally qualified. Signed provider delivery, sustained operating-system
background upload/capture, physical-device proof, app-store release, regional
failover and production-volume evidence remain.

- Native iOS and Android shells for social consumption, capture, messaging,
  rooms, Broadcast field production, background upload and push.
- Extend the qualified web outbox/conflict/upload-continuation behavior into
  native background execution once the iOS/Android shell is approved.
- Independent media workers, regional failover, autoscaling and workload
  isolation for render, transcode, live and AI jobs.
- Playback, messaging, automation, commerce and room SLOs with error budgets.
- Abuse, fraud, spam, copyright, payment-risk and moderation operations at
  production volume.
- Cost attribution and quotas per tenant, creator, asset and delivery minute.
- Disaster recovery exercises, data residency choices and verified restore
  objectives.

### Exit gate

Representative devices, networks, regions, workloads and failure modes meet
the published SLOs without cross-tenant leakage, unbounded cost or manual data
repair.

## Phase 7 — Ecosystem and selective infrastructure ownership

**Priority:** P3; start only after stable internal contracts and demonstrated
external demand.

**Current worktree state:** the scoped API-key, OpenAPI, signed-webhook,
retry/dead-letter and distributed-rate-limit foundation, delegated OAuth,
typed SDK, sandbox tenancy, reviewed app marketplace and governed data
portability are implemented and locally qualified. Package-registry
publication, independently controlled third-party adoption, agency-wide active
tenant selection and selective infrastructure ownership remain decision or
external-evidence gates.

- Public OAuth applications, scoped API keys, signed webhooks, SDKs, developer
  sandbox, app installation/revocation and integration marketplace.
- Importers and migrations for audiences, media, products, courses, podcasts,
  contacts and automations from competing tools.
- Agency and multi-client operational views where the tenant model supports
  them without weakening isolation.
- Evaluate self-operated encoders, media storage/CDN, realtime infrastructure
  or data centers only when measured cost, sovereignty, performance or vendor
  risk justifies the operational burden.

### Exit gate

Third parties can extend CreativesOS safely, and any infrastructure moved
in-house has a measured economic or control advantage plus an evidenced
operations and rollback plan.

## Priority register

| Priority | Outcome | Workstreams |
| --- | --- | --- |
| P0 | Protect launch and create the missing shared foundation | Phase 0; Media Cloud; DAM; events/attribution; planning; audience identity; notifications; search/recommendation contracts; rights |
| P1 | Complete the owned creator workflow | Audience Studio; Podcast Studio; DesignStudio; creator site; sponsorship; provider-neutral competitive gap closure |
| P2 | Expand revenue, mobility and live operation | Affiliates; booking/ticketing; marketplace maturity; provider activation; native mobile; scalable media/realtime workers |
| P3 | Become an extensible and selectively self-hosted platform | Developer ecosystem; imports; agency surfaces; advertising marketplace; physical commerce; justified owned infrastructure |

## Explicit exclusions until separately approved

- Copying competitor code, proprietary assets, trademarks or exact expressive
  UI compositions.
- Private-session scraping or unofficial messaging/publishing workarounds.
- An advertising exchange, physical-goods logistics network, tax engine,
  licensed stock-media catalog or general accounting suite before their
  operating models are intentionally selected.
- Building data centers or replacing commodity media infrastructure before
  utilization, cost and control thresholds justify it.
- Allowing UMH or any external provider to become the canonical owner of local
  CreativesOS product state.

## Roadmap operating rules

1. Work in dependency order, not by whichever screen is visually exciting.
2. Extend shared identity, asset, event, permission and evidence primitives
   before adding a new vertical-specific copy.
3. Keep native, provider, production, competitive, legal and scale states
   separate in every status report.
4. Qualify desktop and mobile-web behavior for every native slice; add physical
   device proof where capture, playback, push or background execution matters.
5. Deploy only after repository gates pass, then separately record production
   migration, health, identity and field evidence.
6. Do not call a capability equal or superior until its golden benchmark passes.
7. Close broken core outcomes before adding specialist depth.
8. Review and re-prioritize the roadmap using usage, support, reliability,
   commercial and benchmark evidence—not feature-count pressure.

## Immediate execution tranche

The provider-independent web tranche is complete. The residual Phase 6/7
closure is now bounded by product, publication or external evidence:

1. **Complete locally:** delegated OAuth app authorization, installations,
   token rotation and revocation;
2. **Complete locally:** typed SDK packages and a versioned developer sandbox
   contract;
3. **Complete locally:** governed import/export adapters for canonical media,
   audience, products, courses, podcasts, contacts and automations;
4. **Complete locally:** web/PWA offline post, message and media queues,
   conflict review, server idempotency and restartable uploads;
5. **Complete locally:** scaffold the native iOS/Android shell, safe deep links,
   lifecycle/network recovery, explicit push consent, encrypted device
   registration and bounded background wake; sustained capture/upload remains
   a physical-device and platform-policy gate;
6. **Complete locally and in protected CI:** run the complete unit/build/migration/security,
   recovery, capacity and 180-execution browser suite and reconcile its
   evidence without overwriting older production truth;
7. **Complete in production:** deploy exact merge commit `e7642ed` from an
   immutable clean snapshot, apply all 104 migrations, and verify
   health/readiness, `sourceDirty: false`, exact production identity, auth
   routing, public routes and protected API/route boundaries. A fresh safe
   signed-in route repeat remains an authorized-session evidence gate rather
   than missing native code;
8. hand off only the true external gates: provider approval/credentials,
   physical devices/app stores, UMH-side pairing, legal decisions and
   authorized competitor operator runs.
