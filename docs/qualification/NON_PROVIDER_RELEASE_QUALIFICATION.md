# CreativesOS non-provider release qualification

Qualified scope: roadmap items 1-6, excluding external provider activation and provider-owned end-to-end delivery.

## Release gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Account privacy lifecycle | Passed | Export sanitization, ownership preflight, scheduled deletion, cancellation, local erasure, shared-message redaction, identity tombstone, retry and multi-machine claiming are covered by policy and release qualification tests. |
| Application regression | Passed | 59 test files and 199 tests passed, followed by a clean TypeScript check, production build, and bundle-budget gate. |
| Browser automation | Passed | Thirty-two Playwright journeys passed on both Pixel 7 and desktop Chromium (64 executions), including persisted social, messaging, community, learning, business, distribution, privacy, moderation, federation and accessibility lifecycles. |
| Security and operations | Passed | Source credential scan clean, production dependency audit clean, same-origin mutation protection covered, backup/hash/restore qualification passed, and operational runbooks are present. |
| Accessibility and performance | Passed locally | No critical or serious Axe findings across the primary application routes, Trust Center, or Privacy surface. Initial and deferred JavaScript bundles are within enforced gzip budgets. The disposable HTTP capacity probe completed with zero failures. A measured production Core Web Vitals trace remains a post-deployment observation rather than a local release blocker. |
| Legal and trust surfaces | Operational surfaces passed; binding documents pending operator and counsel decisions | Trust Center, account-deletion policy, community safety policy, and AI/recording policy are public. Binding Terms of Service and Privacy Policy are intentionally not represented as approved until the legal entity, jurisdiction, launch-region, age, marketplace, tax, data-transfer, DMCA, and counsel decisions in `docs/legal/LEGAL_LAUNCH_HANDOFF.md` are resolved. |

## Local evidence

- `npm run verify`: passed (199 tests, TypeScript, production build, bundle budgets).
- `npm run verify:browser`: passed (64/64 mobile and desktop executions against a fresh PostgreSQL database with all 63 migrations).
- `npm run verify:relationship-release`: passed (63 migrations; relationship operations, automation kernel, native comment-to-DM, opt-out, privacy and deletion qualification).
- `npm run verify:backup-restore`: passed (manifest verified, 63 migrations restored, required tables present, zero orphan direct messages).
- `npm run verify:secrets`: passed (490 source files scanned).
- `npm run verify:capacity`: passed (200 requests at concurrency 20, zero failures, 208 requests/second, p95 326.1 ms in the local qualification environment).
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.

## Production evidence

- Fly release: `v228`; both production machines converged on the same image with passing health checks after the release migration completed successfully.
- `GET /api/health`: HTTP 200 with `status: ok`.
- `GET /api/ready`: HTTP 200 with `status: ready`, database ready, R2 configured, federation evidence storage ready, and no release blockers.
- Capacity probe: 200 requests at concurrency 20, zero failures, 124.4 requests/second, p50 119.8 ms, p95 297.6 ms, p99 367.3 ms.
- Security probes: HSTS, frame denial, content-type sniffing protection, and origin isolation present; anonymous privacy access returned 401; a hostile-origin privacy mutation returned 403.
- Signed-in browser field test: all safe application workspaces rendered without route or console failures; LiveKit joined with camera and microphone off and reached a connected participant state; OpenAI agent creation/chat reached the provider and returned the explicit quota-exhausted state; Stripe processed a signed full-refund event and reversed access plus the creator allocation; external channels remain honestly provider-disabled.
