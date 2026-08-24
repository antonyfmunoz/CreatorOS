# Provider-independent closure: workstreams 1–7 and activation control plane

Qualification date: 2026-08-24

This register separates completed repository evidence from actions that need a
production identity, paid infrastructure, a physical device, or a third-party
provider. A configured shell is not represented as a successful live provider
round trip.

| # | Workstream | Implemented closure | Qualification evidence |
| --- | --- | --- | --- |
| 1 | Media-quality regression | CutStudio render qualification now measures codec, dimensions, frame rate, duration drift, A/V offset, VMAF, SSIM, PSNR, integrated loudness, loudness range and true peak from uploaded media. | The authenticated upload-to-render-to-private-download browser journey passes on mobile and desktop. The qualification floor is VMAF 80, SSIM 0.94, PSNR 30 dB, duration drift 100 ms and A/V start offset 50 ms. |
| 2 | Scale, soak and chaos | A mixed authenticated HTTP profile covers nine read/write paths and two isolated users; a sustained readiness soak and forced web-process replacement are part of the same disposable-database gate. Worker claim serialization, stale recovery, active-lease preservation and deterministic rate-limit behavior are separately tested. | Final local run: 1,600 mixed requests at concurrency 32, zero failures, 298.9 requests/second, p95 168.2 ms and p99 224.9 ms. The 30-second soak completed 15,091 requests at concurrency 24 with zero failures, 502.4 requests/second, p95 105.4 ms and p99 123.3 ms. Readiness recovered and authenticated writes survived process replacement. The limiter admits 240 requests and throttles the following 20 with `Retry-After`. |
| 3 | Production smoke | A read-only production Playwright suite verifies release identity, health/readiness, auth-page navigation boundaries, accessibility, and 16 authenticated workspaces on mobile and desktop. Every protected deployment finishes with exact-commit public smoke. The separate `all` workflow mints short-lived Clerk authentication for a dedicated smoke identity inside an isolated setup project, then reuses only that ephemeral browser state across mobile and desktop. Personal sessions and static cookies are not stored. Failure evidence is retained. | Protected production-smoke run [`32760646885`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32760646885) passed both public boundaries and authenticated production journeys against deployed commit `3fdd0b95b9e8e4243dbe9cfbd8e584c5ae94cf48`. The authenticated job traversed all 16 workspaces on mobile and desktop without destructive mutations. PR [`#50`](https://github.com/antonyfmunoz/CreatorOS/pull/50) passed the complete protected CI matrix before the renewable identity flow reached `main`. |
| 4 | Stitch-only visual regression | All and only the 74 `attached_assets/stitch_creatoros/stitch_creatoros/*/screen.png` references have path, PNG, dimension and SHA-256 custody. Six canonical surfaces are compared against selected Stitch frames using visual-signature bounds; temporary candidate captures are never promoted to reference images. | The 74-reference manifest gate passes. Explore, Marketplace, native Messages, Profile, Notifications and Settings pass together on the mobile portrait canvas. Desktop behavior remains covered by the broader browser matrix. |
| 5 | Scale and deployment infrastructure | Production and staging Fly manifests define separate web, media and CutStudio process groups, readiness checks, release migrations, memory/CPU classes and safe staging scale-to-zero behavior. A machine-readable worker scaling policy defines queue-age/depth thresholds, cooldowns, min/max bounds, cost ceiling and fail-closed controls. A protected read-only workflow sanitizes live Fly machine metadata and audits process counts, resource classes and release-image consistency. Production releases preserve the detected compact or scaled topology; mixed groups fail closed, and any topology transition requires an exact explicit confirmation. | `verify:infrastructure` statically qualifies both manifests, the scaling policy, live-audit logic and topology resolver. Protected release run [`32664016977`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32664016977) preserved the compact production topology while deploying exact commit `e0f6409d1a0645d41fe920893e4c164b51ab20d6`. Post-release read-only audit [`32665248113`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/32665248113) observed one active legacy `app` Machine, one release image, and no `web`, `media` or `cut` group; it correctly records drift from the unapplied paid scaled target. Applying those production machine counts is deliberately excluded because it creates paid infrastructure. |
| 6 | Dependency lifecycle | Compatible dependency updates are locked; GitHub Actions use current checkout/setup-node majors; Wrangler worker types were regenerated and its deployment dry-run passes. Major framework migrations are isolated rather than bundled into a production closure release. | Full and production dependency audits report zero vulnerabilities. Unit, type, build, bundle and Worker gates pass on the updated lockfile. `DEPENDENCY_LIFECYCLE.md` records the major-version migration backlog and acceptance policy. |
| 7 | Quality, fairness and migration exercises | Discovery selection has a pure deterministic diversity stage with per-creator caps and topic alternation; protected ranking inputs are rejected. Portability import validates the documented 5,000-product boundary and rejects over-limit and duplicate source identifiers. | The 10,000-candidate fairness cohort passes determinism, creator-cap and topic-diversity assertions. Exact-ceiling and rejection-path portability tests pass alongside the existing authenticated export/deletion and discovery browser journeys. |
| 8 | Provider activation control plane | A tenant-scoped business surface defines 22 external capability families and 14 mandatory activation stages across sandbox, staging and production. Evidence is append-only, secret-screened, referenced by safe HTTPS URLs, privacy-exported, deletion-scoped, and immutable after qualification or abandonment. Platform commerce and creator payouts have separate dossiers. | Unit/contract and migration tests pass. The two-viewport field lifecycle proves invalid-input rejection, cross-tenant denial, early-qualification rejection, all-stage qualification, closure-actor custody and closed-run immutability. Dashboard reads and qualification checks load only the latest record per stage, while the complete audit history remains available for privacy evidence. No credential or live round trip is inferred. |

## Release-wide evidence

- Unit, typecheck, production build, bundle budget and Worker dry-deployment
  gates pass.
- The complete authenticated browser matrix schedules 202 executions on
  disposable 106-migration databases across mobile and desktop: 196 pass, six
  are intentional skips, and none fail. It includes media, offline recovery,
  activation and data-portability lifecycles.
- Relationship automation release, worker resilience, backup/restore, native
  mobile configuration, secrets scan, Stitch custody, infrastructure and
  dependency audit gates pass.
- Production release identity was rechecked against the immutable deployed
  commit; local and CI evidence were not used as a substitute for that fact.
- Live release identity is intentionally not hardcoded in this register because
  changing the evidence document creates a new source commit. `/api/release` is
  the canonical current identity and `/api/ready` is the canonical readiness
  boundary; protected deployment and smoke workflows require the expected
  commit, clean-source identity, migration parity, healthy private R2 delivery,
  production authentication, and zero release blockers.

## External completion boundaries

The following are real completion gates but cannot be truthfully converted into
repository-only proof:

1. Approve and apply the scaled Fly process counts, which changes paid resource
   consumption.
2. Complete live account/provider round trips for still-pending social,
   realtime, transcription, cloned-voice and broadcast destinations.
3. Complete physical-device/App Store distribution checks and human subjective
   competitive-quality review where a deterministic software oracle is not
   possible.

These boundaries do not block provider-independent code closure. They remain
explicit so the product is never labeled live-provider-complete from mocks,
configuration, or local qualification alone.
