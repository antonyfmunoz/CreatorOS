# CreativesOS non-provider release qualification

Qualified scope: roadmap items 1-6, excluding external provider activation and provider-owned end-to-end delivery.

## Release gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Account privacy lifecycle | Passed | Export sanitization, ownership preflight, scheduled deletion, cancellation, local erasure, shared-message redaction, identity tombstone, retry and multi-machine claiming are covered by policy and release qualification tests. |
| Application regression | Passed | 72 test files and 271 tests passed, followed by a clean TypeScript check, production build, and bundle-budget gate. |
| Browser automation | Passed | Fifty-eight Playwright journeys passed on both Pixel 7 and desktop Chromium (116 executions), including persisted social, messaging, community, learning, business, distribution, privacy, moderation, federation, Broadcast, CutStudio, connected-creation, and accessibility lifecycles. |
| Security and operations | Passed | Source credential scan clean, production dependency audit clean, same-origin mutation protection covered, backup/hash/restore qualification passed, and operational runbooks are present. |
| Accessibility and performance | Passed | No critical or serious Axe findings across the primary application routes, Trust Center, or Privacy surface. Initial and deferred JavaScript bundles are within enforced gzip budgets. The production v303 Lighthouse trace scored 96 performance and 100 accessibility with 1.70 s FCP/LCP, 209 ms total blocking time, 0.019 CLS and 99 ms server response. |
| Legal and trust surfaces | Operational surfaces passed; binding documents pending operator and counsel decisions | Trust Center, account-deletion policy, community safety policy, and AI/recording policy are public. Binding Terms of Service and Privacy Policy are intentionally not represented as approved until the legal entity, jurisdiction, launch-region, age, marketplace, tax, data-transfer, DMCA, and counsel decisions in `docs/legal/LEGAL_LAUNCH_HANDOFF.md` are resolved. |

## Local evidence

- `npm run verify`: passed (271 tests across 72 files, TypeScript, production build, bundle budgets and Worker dry run).
- `npm run verify:browser`: passed (116/116 mobile and desktop executions against a fresh PostgreSQL database with all 80 migrations).
- `npm run verify:relationship-release`: passed (80 migrations; relationship operations, automation kernel, native comment-to-DM, opt-out, privacy and deletion qualification).
- `npm run verify:backup-restore`: passed (manifest verified, all 80 migrations restored, required tables present, zero orphan direct messages).
- `npm run verify:secrets`: passed (571 source files scanned).
- `npm run verify:capacity`: passed (200 requests at concurrency 20, zero failures, 244 requests/second, p50 52.9 ms, p95 156.8 ms and p99 571.4 ms in the qualification environment).
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities.

## Production evidence

- Fly release: `v303` from commit `8514e15`; the serving machine is healthy and the stopped machine is the expected standby. The release migration confirmed all 80 migrations. Production migrations use a transaction-scoped advisory lock, and the deployment runner completed without leaving a pooled session lock.
- `GET /api/health`: HTTP 200 with `status: ok`.
- `GET /api/ready`: HTTP 200 with `status: ready`, database ready, R2 configured, federation evidence storage ready, and no release blockers.
- Capacity probe: 200 requests at concurrency 20, zero failures, 124.4 requests/second, p50 119.8 ms, p95 297.6 ms, p99 367.3 ms.
- Security probes: HSTS, frame denial, content-type sniffing protection, and origin isolation present; anonymous privacy access returned 401; a hostile-origin privacy mutation returned 403.
- Anonymous entry performance: server-side `/` to `/auth/login` redirect; Lighthouse 96 performance and 100 accessibility, 1.70 s FCP/LCP, 209 ms total blocking time, 0.019 CLS and 99 ms server response. Application-only overlays are deferred outside authentication, reducing enforced initial JavaScript to 109,392 gzip bytes from the earlier 208,446-byte entry.
- Signed-in browser field test: all safe application workspaces rendered without route or console failures; v299 additionally verified Broadcast, a real CutStudio project, Distribution and its queue, all automation views, the six profile tabs, Marketplace filtering and stable product details, communities, and the Create hub. LiveKit joined with camera and microphone off and reached a connected participant state; OpenAI agent creation/chat reached the provider and returned the explicit quota-exhausted state; Stripe processed signed refund and dispute lifecycles, reversed and restored the creator transfer, drained recovery residue to zero, and persisted a connected-account payout failure; external channels remain honestly provider-disabled.
