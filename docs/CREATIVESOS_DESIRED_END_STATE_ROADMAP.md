# CreativesOS desired-end-state roadmap

Last reconciled: 2026-08-26

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
- Foundation Studio instruments for documents, sheets, slides, tables, forms,
  calendar and finance, with tenant-scoped persistence, revisions, lifecycle
  events, privacy handling and projection-side UMH commands.
- Governed canvas/design revisions, Production Planner tasks and dependencies,
  consent-aware community conference rooms, guest invitations and role-scoped
  meeting policy, each qualified across mobile and desktop journeys.
- Vision Studio for explicit camera/screen capture, ephemeral frames, grounded
  observations, expiring watches, private opt-in snapshots, presets, audit,
  privacy export and bounded projection-side UMH control.
- DesignStudio-to-Media-Cloud image selection using authorized same-origin
  streams, cover/contain/fill rendering, alternative text, durable asset IDs
  and canonical derivative lineage.
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

- The current production baseline is exact clean commit
  `df36cfcda8baef40c148b3a5ecfb5bbde41aff05`. Protected deployment
  [`32966557573`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32966557573)
  repeated the complete verification and browser matrix, created the required
  private backup receipt, preserved the compact Fly topology, applied and
  proved all 114 migrations, deployed, and verified the serving source
  identity through the expanded public application boundary.
- Independent all-scope production smoke
  [`32968690800`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32968690800)
  passed against that exact commit: seven safe public surfaces, 58
  authenticated workspaces and three read-only provider preflights completed
  without an auth redirect, application failure, server error or release
  identity mismatch. The local four-shard census separately renders all 110
  registered public and protected route patterns.
- The current unreleased closure candidate schedules 262 isolated PostgreSQL
  browser executions on a clean 114-migration database: 238 pass, 24
  viewport-conditional Stitch cases are intentionally skipped, and none fail.
  All 24 canonical Stitch states execute once on the mobile portrait canvas;
  the wider behavioral suite covers mobile and desktop. The same candidate
  passes unit, type, build, bundle, Worker, secrets, infrastructure, native
  mobile, relationship, worker-recovery, Media Cloud, backup/restore and
  capacity gates. This is local evidence until an exact immutable deployment
  and independent production smoke qualify its source identity.
- The immediately preceding Vision release was independently qualified as
  exact commit `fc04815b16a6c4c4ada893e52ca0821f3e17e5aa` by protected deploy
  [`32964130485`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32964130485)
  and all-scope production smoke
  [`32966336188`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32966336188).
- Foundation, governed Canvas, Tasks and Conference were released in order by
  PRs 73–76. Their exact merge commits are `c70dd1247ff23749776a6203cac6fdd76b0ac694`,
  `a9ef69f50f496bf2cd04c6f9352d89deb8bd7df5`,
  `719aa836afc82fc2789cdec61a499ae18b3700fc` and
  `b8cdd586f0627cbcfa5d2566a9ac93ffcdd0aafe`; the final Conference baseline
  passed protected deploy
  [`32959438034`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32959438034)
  and independent all-scope smoke
  [`32961718311`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32961718311).

- Protected deployment run
  [`32921856656`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32921856656)
  requalified and deployed exact clean `main` commit
  `4b1a08111c799f1ea68d498b895071af77e6fd44` while preserving the compact Fly
  topology. Live `/api/release` independently reports that commit, build ID
  `20260826T022653Z-0b234f603c08`, clean source and exact 109/109 migration
  parity; `/api/ready` reports `ready` with zero release blockers, configured
  encrypted token custody, a configured YouTube adapter, configured
  Relationship Hub AI and configured LiveKit media.
- Protected all-scope production-smoke run
  [`32922955104`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32922955104)
  passed both public production boundaries and the non-destructive authenticated
  workspace journeys against that exact deployed commit. The authenticated
  preflight read Distribution connections, Relationship Hub AI status and
  external-adapter availability without mutating data or exposing credentials.
- Protected backup qualification run
  [`32897368705`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32897368705)
  verified the newest private archive's durable size, hash, readability, required
  inventory and 73,437-second age against the enforced 108,000-second ceiling.
- The provider-activation control plane and specialist-substitution parity
  enforcement are locally qualified: 119 unit/contract files and 461 tests,
  TypeScript, production build, bundle and Worker gates, a fresh 109-migration database with 219
  required tables, backup/restore, worker recovery, secrets, dependency,
  infrastructure, mobile and capacity gates all pass. The complete two-viewport
  field matrix scheduled 204 executions, with 198 passing and six intentional
  skips and no failures.
- Protected deployment run
  [`32664016977`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32664016977)
  requalified and deployed exact protected `main` commit
  `e0f6409d1a0645d41fe920893e4c164b51ab20d6` while preserving the detected
  compact Fly topology. Live `/api/release` reports verified clean source,
  fingerprint
  `a630ae460daa78451420d308d3000f2706caa83e56047798f2491e525dee3053`,
  and 106/106 migration parity; `/api/health` and `/api/ready` are healthy with
  zero release blockers, configured private R2 asset delivery and production
  authentication.
- Post-release read-only topology audit
  [`32665248113`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32665248113)
  observed one active legacy `app` Machine and one release image. No paid
  `web`, `media`, or `cut` expansion has been applied.
- Protected all-scope production-smoke run
  [`32760646885`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32760646885)
  independently passed public release, health/readiness, auth-boundary and
  accessibility checks plus all 16 authenticated production workspaces on
  mobile and desktop against exact deployed commit
  `3fdd0b95b9e8e4243dbe9cfbd8e584c5ae94cf48`. Authentication used a dedicated
  smoke identity and short-lived Clerk testing state; no personal session or
  static cookie is retained.
- Protected workflow run
  [`32603964955`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32603964955)
  deployed the dated 2026-08-22 production baseline from exact `main` merge
  commit `6b8e5d0aadb3da8668a2d1bb73c39d7fb9ef63b9` and an immutable
  `git archive` snapshot after repeating 112 files / 432 tests, TypeScript,
  the production build, bundle and Worker gates, the worker lease/recovery
  qualifier, all 105 migrations, and all 186 Pixel 7/desktop Chromium
  executions in deployment order.
- The release made a completed private backup, hydrated the immutable snapshot
  from its exact lockfile without lifecycle scripts, verified the migration
  ledger before and after deployment, completed Fly's release command, and
  completed a healthy two-machine rolling update. The workflow record and live
  release endpoint are the durable deployment evidence; no mutable image alias
  is treated as canonical.
- Independent live checks at that baseline proved `/api/health` and
  `/api/ready` healthy with no release blockers. `/api/release` reported build
  `20260822T231601Z-ae40d0f51350`, the exact merge commit, fingerprint
  `ae40d0f513503cd4499e74493cdd1bf1446663fda21787f3d45beedebea2827f`,
  `sourceDirty: false`, verified identity, and 105/105 migration parity. The
  live `/api/release` response, rather than any dated value in this document,
  is canonical for the currently deployed runtime.
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
  security headers on the clean release. Renewable authenticated production
  smoke now independently traverses all 16 workspaces at both viewports; the
  live `/api/release` endpoint remains canonical for current source identity.
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
| Operations and scale | Native control plane, immutable release source and exact clean production identity are qualified; `/api/release` is canonical for the current commit and migration ledger | Repeat authorized signed-in field evidence, then exercise regional media/realtime resilience and production volume | Published SLOs, bounded cost, tested recovery and safe multi-tenant scale |
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
capture are implemented across twenty explicit comparison families. Every
comparison remains `not_benchmarked` until an authorized operator performs the
same-input run; no parity claim is inferred. Runs now require identical locked
source/device/network/operator/locale conditions and hashed input, action-log,
output and recording artifacts. Operators can upload those four artifacts from
the visible Benchmark Lab workflow into tenant-scoped private storage; the
server calculates their hashes and revalidates stored bytes before sealing the
run. Manual external evidence remains possible only with a complete SHA-256.

Each named comparison product now has a versioned specialist-substitution
contract. Parity cannot be awarded from aggregate scores, speed or a feature
sample: every required capability for that product needs one evidence-linked
reviewer verdict, and any failed capability forces `parity_failed`. A material
normal-workflow deficit is mandatory product backlog even when CreativesOS has
a different integrated purpose. Specialist-edge exclusions must be explicit;
they cannot silently lower the replacement standard.

Failed capability verdicts now become tenant-scoped, priority-100 remediation
records and synchronized Production Planner work in the same transaction as
the immutable assessment. Operators may triage, work and mark the item ready
for retest, but neither the benchmark surface nor the planner can close it
manually. Only a later passing locked same-product assessment resolves the
remediation and its linked work item; a later failure reopens the same lineage
and increments its failure count.

### Native social

- Maintain the implemented watch-session telemetry, Following/For You and
  chronological contracts, governed notifications, block/mute/restriction and
  creator analytics experiences.
- Benchmark publishing, consumption, interaction, discovery and recovery
  against Instagram, TikTok, YouTube and X normal creator workflows.

### Media Cloud, DAM and planning

- Benchmark checksum-preserving ingest, rendition/playback, permissions,
  review, version lineage, telemetry, export and verified deletion against the
  selected video-hosting and asset-review products.
- Benchmark idea-to-retrospective planning with the same campaign, assets,
  dependencies, approvals and outcome evidence against the selected work
  management products.

### CutStudio

- Complete the clean-room programmable composition runtime defined in
  [`CUT_STUDIO_PROGRAMMABLE_CINEMA_STANDARD.md`](./CUT_STUDIO_PROGRAMMABLE_CINEMA_STANDARD.md):
  general visual authoring plus allowlisted vector/path, 3D, geometric
  transition and animated-effect browser preview are implemented, as are
  typed parameter binding and idempotent durable batches of up to 20 named
  variants, while private images, text, shapes, paths and sanitized SVG now
  compile through sampled position, opacity, scale, Z/X/Y rotation,
  perspective, blur, brightness and saturation into FFmpeg output, including
  animated flip, directional wipe, iris, clock and authorized private
  custom-mask transitions, plus the allowlisted stylized-effect stack; private
  TTF/OTF selection and final rendering are implemented, while native
  Lottie/Rive/Three playback and an isolated code executor remain.
- Complete the cinematic production runtime: brief, cast/world/prop continuity,
  first/last/reference frames, camera/lens/focal/lighting/movement direction,
  visual multi-model workflow authoring, generation lifecycle and variant
  records are implemented; private project video now enters durable candidate
  review with select/reject/supersede decisions and direct lineage-preserving
  EDL v3 handoff. Provider execution, callback ingest and provider-result field
  proof remain.
- Close benchmark-discovered normal-workflow gaps against Premiere, Resolve,
  Descript, CapCut, Remotion and Higgsfield independently; only then measure the
  connected Broadcast/Media Cloud/Distribution advantage.
- Add translated captions, provider-backed transcription/diarization,
  subject-aware reframing and scalable 4K workers when justified by the target
  workflow.

### Broadcast and conference production

- Activate and qualify remote guests, external destinations, long-duration
  capture, native mobile field capture and supervised regional failover.
- Complete role-scoped realtime meeting AI with visible consent and stop
  behavior.

### Meeting intelligence

- Benchmark consent, speaker attribution, transcript correction, permitted
  guest context, evidence-linked coaching, disclosed role-scoped AI
  participation, human override, decisions, revocation and audit evidence.
- Keep covert recording, impersonation, diagnostic psychoanalysis and ambient
  cross-role data access outside the product boundary.

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

### Owned publishing and commercial studios

- Benchmark Audience Studio capture, consent, identity, segmentation,
  sequences, replies, suppression, attribution and portable export.
- Benchmark DesignStudio, Podcast Studio and creator-site workflows using the
  same source, brand, accessibility, revision, publication and portability
  requirements.
- Benchmark sponsorship, affiliate/referral, booking and ticketing from
  opportunity through rights, fulfillment, attribution, financial recovery
  and renewal.

### Trust operations and developer ecosystem

- Exercise tenant isolation, roles, moderation/appeals, privacy requests,
  secret redaction, rate limits, incident evidence, restore and revocation
  against the locked production-SaaS standard.
- Benchmark sandbox onboarding, least-privilege OAuth, APIs/SDKs, signed
  webhooks, usage evidence, revocation and representative export/import
  reconciliation against mature application platforms.

### Connected advantage

- Run identical source material through the connected CreativesOS workflow and
  the authorized disconnected comparison toolchain.
- Require at least 25% less active operator time or 50% fewer manual handoffs
  without material loss of quality, safety, reliability or control.

### Exit gate

Every market-facing parity or superiority claim has a dated evidence record,
named workflow, current comparison source, failures, reviewer and measurements.
For direct specialist parity, every required capability in the locked product
contract is passed. Connected advantage is assessed only after that direct
replacement threshold is met.

## Phase 5 — Provider activation and live round trips

**Priority:** after the corresponding native contracts are complete. Provider
activation may run earlier only when it is required to qualify an already-built
critical path.

**Current state:** actual third-party activation remains intentionally deferred
by product direction except for providers already evidenced in production.
CreativesOS now owns a tenant-scoped activation control plane for 22 capability
families across sandbox, staging and production. It records append-only,
credential-free evidence, derives readiness from the latest evidence for every
required stage, prevents cross-tenant writes and early qualification, bounds
operational history, preserves the audit record in privacy export/deletion, and
keeps closed runs immutable. This native dossier does not turn an untested
credential into a successful provider round trip.

- Video processing/delivery provider for adaptive VOD and live playback.
- Transactional and bulk email delivery, bounce/complaint and reputation loops.
- Web push and native mobile notification delivery.
- Podcast directory connections and destination verification.
- YouTube, Facebook, Instagram, TikTok, X and other approved
  publishing/analytics adapters.
- Instagram, Messenger, WhatsApp and supported external inbox adapters.
- Remote guest, transcription and realtime-agent workers.
- Relationship AI model provider and cloned-voice provider.
- Broadcast live destinations and encoder health callbacks.
- Stripe platform-commerce payment, subscription, invoice, refund, dispute and
  entitlement evidence, kept distinct from creator proceeds.
- Successful Stripe creator payout with a valid connected-account bank and
  allocation/remediation evidence.
- UMH pairing, capability negotiation and signed command/evidence round trip.

### Provider acceptance template

Every provider requires connect, credential custody, refresh/revoke, inbound,
outbound, webhook signature, idempotency, rate-limit, retry, dead-letter,
receipt, privacy export, deletion and failure-recovery evidence. A passing
stage requires a durable secret-free HTTPS reference; expired evidence no
longer qualifies. A credential being present is not an activation proof.

## Phase 6 — Native mobile, scale and operational maturity

**Priority:** P2, pulled forward where field production or retention requires
it.

**Current worktree state:** installable PWA, web field client, bounded
user-scoped offline post/message/media outbox, server idempotency, restartable
upload intents, generated Capacitor iOS/Android projects, safe deep links,
native lifecycle/network recovery, explicit push consent, encrypted
device-token custody and privacy-safe bounded background wake are implemented
and locally qualified. Signed provider delivery, sustained operating-system
background upload/capture, physical-device proof, app-store release, a paid
multi-region rollout and production-volume evidence remain.

- Native iOS and Android shells for social consumption, capture, messaging,
  rooms, Broadcast field production, background upload and push.
- Extend the qualified web outbox/conflict/upload-continuation behavior into
  native background execution once the iOS/Android shell is approved.
- Independent Media Cloud and CutStudio worker entrypoints, renewable
  compare-and-set leases, regional/capability-aware custody, bounded
  concurrency, cancellation, drain/offline state, expired-lease recovery and
  aggregate capacity telemetry are implemented. Deployment of paid regional
  worker groups, autoscaling policy and real-region loss evidence remain.
- Playback, messaging, automation, commerce, room, media-processing and
  rendering SLOs with error budgets are implemented; representative production
  volume remains an evidence gate.
- Abuse, fraud, spam, copyright, payment-risk and moderation operations at
  production volume.
- Cost attribution and quotas per tenant, creator, asset and delivery minute;
  media and render compute now accept explicit per-minute rates and preserve
  unpriced work as zero rather than inventing cost.
- Weekly and on-demand protected qualification now verifies the newest private
  production backup's live-release lineage, size, SHA-256 manifest, archive
  readability and mandatory-table inventory without exporting storage secrets
  into CI. The existing disposable-PostgreSQL restore drill qualifies restore
  mechanics locally. A quarterly and on-demand one-shot recovery Machine now
  restores the newest real production archive inside the existing private Fly
  application and region, measures RTO, retains only aggregate evidence, and
  removes itself on exit. Both paths reject an invalid, materially future or
  more-than-30-hour-old recovery point. Run `32897371297` passed against verified
  live commit `54b7e1faac5464fd0a0395beba2e9cc8453b25e8`: it restored a
  73,495-second-old 107-migration archive, transactionally advanced it to exact
  108-migration release parity, verified 26 mandatory tables and zero orphan
  direct messages, measured an 18-second RTO and destroyed the exact private
  Machine. Broader data-residency policy and cross-region RTO remain decision
  or scale gates.

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
6. **Complete locally and in protected CI:** the complete
   unit/build/migration/security, recovery, capacity and browser suite passes
   for Vision PR head `5aef7a9986c66a3df11f6be62b6b28eec096e72d`
   in Verify run `32962618225`, and for the final-base DesignStudio PR head
   `acab750f4d833adeb4e680b35aabc42c93af164d` in Verify run
   `32964166774`; both associated CodeQL runs pass;
7. **Release gate complete for this tranche:** protected workflow
   `32966557573` deployed immutable clean commit
   `df36cfcda8baef40c148b3a5ecfb5bbde41aff05`, completed the protected
   backup/migration/deploy sequence, applied all 114 migrations, preserved the
   compact topology, and proved exact release identity. Protected all-scope
   smoke `32968690800` then passed public boundaries, 58 authenticated
   production workspaces and read-only provider preflight. `/api/release`,
   `/api/ready` and `/api/health` remain the canonical current identity and
   readiness boundaries;
8. hand off only the true external gates: provider approval/credentials,
   physical devices/app stores, UMH-side pairing, legal decisions and
   authorized competitor operator runs.
