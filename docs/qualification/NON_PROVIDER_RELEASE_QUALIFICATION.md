# CreativesOS non-provider release qualification

Qualified scope: roadmap items 1-6, excluding external provider activation and provider-owned end-to-end delivery.

## Release gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Account privacy lifecycle | Passed | Export sanitization, ownership preflight, scheduled deletion, cancellation, local erasure, shared-message redaction, identity tombstone, retry and multi-machine claiming are covered by policy and release qualification tests. |
| Application regression | Passed | 55 test files and 184 tests passed, followed by a clean TypeScript check, production build, and bundle-budget gate. |
| Browser automation | Passed | Thirteen Playwright journeys passed on both Pixel 7 and desktop Chromium (26 executions), including durable post/profile/settings mutations, route-selected navigation, marketplace search, joined-community gating/search/context actions, accessibility, privacy, and Trust Center. |
| Security and operations | Passed | Source credential scan clean, production dependency audit clean, same-origin mutation protection covered, backup/hash/restore qualification passed, and operational runbooks are present. |
| Accessibility and performance | Passed locally | No critical or serious Axe findings across the primary application routes, Trust Center, or Privacy surface. Initial and deferred JavaScript bundles are within enforced gzip budgets. The disposable HTTP capacity probe completed with zero failures. A measured production Core Web Vitals trace remains a post-deployment observation rather than a local release blocker. |
| Legal and trust surfaces | Operational surfaces passed; binding documents pending operator and counsel decisions | Trust Center, account-deletion policy, community safety policy, and AI/recording policy are public. Binding Terms of Service and Privacy Policy are intentionally not represented as approved until the legal entity, jurisdiction, launch-region, age, marketplace, tax, data-transfer, DMCA, and counsel decisions in `docs/legal/LEGAL_LAUNCH_HANDOFF.md` are resolved. |

## Local evidence

- `npm run verify`: passed (184 tests, TypeScript, production build, bundle budgets).
- `npm run verify:browser`: passed (26/26 mobile and desktop executions).
- `npm run verify:relationship-release`: passed (61 migrations; relationship operations, automation kernel, native comment-to-DM, opt-out, privacy and deletion qualification).
- `npm run verify:backup-restore`: passed (manifest verified, 61 migrations restored, required tables present, zero orphan direct messages).
- `npm run verify:secrets`: passed (481 source files scanned).
- `npm run verify:capacity`: passed (200 requests at concurrency 20, zero failures, 277.2 requests/second, p95 168.2 ms in the local qualification environment).
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.

## Production evidence

- Fly release: `v209`; both production machines converged on the same image after the release migration completed successfully.
- `GET /api/health`: HTTP 200 with `status: ok`.
- `GET /api/ready`: HTTP 200 with `status: ready`, database ready, R2 configured, federation evidence storage ready, and no release blockers.
- Capacity probe: 200 requests at concurrency 20, zero failures, 132.1 requests/second, p50 110.6 ms, p95 310.4 ms, p99 359.6 ms.
- Security probes: HSTS, frame denial, content-type sniffing protection, and origin isolation present; anonymous privacy access returned 401; a hostile-origin privacy mutation returned 403.
- Signed-in browser field test: Relationship Hub rendered its native conversation, CRM and governed controls; Settings persisted a notification change through reload and was restored; Profile exposed exactly six tabs, selected Likes, and reported a 718px viewport over a 1436px scroll rail with `overflow-x: auto` and no scrollbar; Marketplace search returned one stable matching offer and `/marketplace/product/1` rendered the product rather than an unavailable state; the owned community workspace rendered its gated channels and room shell.
