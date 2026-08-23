# Provider-independent closure: workstreams 1–7

Qualification date: 2026-08-22

This register separates completed repository evidence from actions that need a
production identity, paid infrastructure, a physical device, or a third-party
provider. A configured shell is not represented as a successful live provider
round trip.

| # | Workstream | Implemented closure | Qualification evidence |
| --- | --- | --- | --- |
| 1 | Media-quality regression | CutStudio render qualification now measures codec, dimensions, frame rate, duration drift, A/V offset, VMAF, SSIM, PSNR, integrated loudness, loudness range and true peak from uploaded media. | The authenticated upload-to-render-to-private-download browser journey passes on mobile and desktop. The qualification floor is VMAF 80, SSIM 0.94, PSNR 30 dB, duration drift 100 ms and A/V start offset 50 ms. |
| 2 | Scale, soak and chaos | A mixed authenticated HTTP profile covers nine read/write paths and two isolated users; a sustained readiness soak and forced web-process replacement are part of the same disposable-database gate. Worker claim serialization, stale recovery, active-lease preservation and deterministic rate-limit behavior are separately tested. | Final local run: 1,600 mixed requests at concurrency 32, zero failures, p95 224.8 ms and p99 360.4 ms. The 30-second soak completed 13,410 requests at concurrency 24 with zero failures, p95 129.1 ms and p99 158 ms. Readiness recovered and authenticated writes survived process replacement. The limiter admits 240 requests and throttles the following 20 with `Retry-After`. |
| 3 | Authenticated production smoke | A read-only production Playwright suite verifies release identity, health/readiness, auth-page navigation boundaries, accessibility, and 16 authenticated workspaces on mobile and desktop. A manual protected GitHub workflow accepts an ephemeral session token or storage state and retains failure artifacts. | Configuration discovery lists four production tests. Public production `/api/release`, `/api/health` and `/api/ready` were independently reachable and verified before this release. An authenticated live run remains a session-secret execution gate, not missing application code. |
| 4 | Stitch-only visual regression | All and only the 74 `attached_assets/stitch_creatoros/stitch_creatoros/*/screen.png` references have path, PNG, dimension and SHA-256 custody. Six canonical surfaces are compared against selected Stitch frames using visual-signature bounds; temporary candidate captures are never promoted to reference images. | The 74-reference manifest gate passes. Explore, Marketplace, native Messages, Profile, Notifications and Settings pass together on the mobile portrait canvas. Desktop behavior remains covered by the broader browser matrix. |
| 5 | Scale and deployment infrastructure | Production and staging Fly manifests define separate web, media and CutStudio process groups, readiness checks, release migrations, memory/CPU classes and safe staging scale-to-zero behavior. A machine-readable worker scaling policy defines queue-age/depth thresholds, cooldowns, min/max bounds, cost ceiling and fail-closed controls. | `verify:infrastructure` statically qualifies both manifests and the scaling policy. Applying the production machine counts is deliberately excluded because it creates paid infrastructure. |
| 6 | Dependency lifecycle | Compatible dependency updates are locked; GitHub Actions use current checkout/setup-node majors; Wrangler worker types were regenerated and its deployment dry-run passes. Major framework migrations are isolated rather than bundled into a production closure release. | Full and production dependency audits report zero vulnerabilities. Unit, type, build, bundle and Worker gates pass on the updated lockfile. `DEPENDENCY_LIFECYCLE.md` records the major-version migration backlog and acceptance policy. |
| 7 | Quality, fairness and migration exercises | Discovery selection has a pure deterministic diversity stage with per-creator caps and topic alternation; protected ranking inputs are rejected. Portability import validates the documented 5,000-product boundary and rejects over-limit and duplicate source identifiers. | The 10,000-candidate fairness cohort passes determinism, creator-cap and topic-diversity assertions. Exact-ceiling and rejection-path portability tests pass alongside the existing authenticated export/deletion and discovery browser journeys. |

## Release-wide evidence

- Unit, typecheck, production build, bundle budget and Worker dry-deployment
  gates pass.
- The complete authenticated browser matrix passes on disposable 105-migration
  databases across mobile and desktop, including media and data-portability
  lifecycles.
- Relationship automation release, worker resilience, backup/restore, native
  mobile configuration, secrets scan, Stitch custody, infrastructure and
  dependency audit gates pass.
- Production release identity must be rechecked against the immutable commit
  after deployment; local and CI evidence alone do not establish that fact.

## External completion boundaries

The following are real completion gates but cannot be truthfully converted into
repository-only proof:

1. Run the protected authenticated production-smoke workflow with a short-lived
   production session secret.
2. Approve and apply the scaled Fly process counts, which changes paid resource
   consumption.
3. Complete live account/provider round trips for still-pending social,
   realtime, transcription, cloned-voice and broadcast destinations.
4. Complete physical-device/App Store distribution checks and human subjective
   competitive-quality review where a deterministic software oracle is not
   possible.

These boundaries do not block provider-independent code closure. They remain
explicit so the product is never labeled live-provider-complete from mocks,
configuration, or local qualification alone.
