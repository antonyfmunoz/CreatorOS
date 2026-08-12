# CreativesOS security release controls

- Clerk remains the authentication authority; CreativesOS resolves each Clerk
  identity to one local account and rejects erased accounts.
- Every protected mutation requires authenticated, tenant-scoped authority.
- Browser mutations with an `Origin` header must come from `PUBLIC_APP_URL`.
  Signed webhooks and server-to-server ingress retain their independent
  signature and replay contracts.
- Secrets are loaded at runtime, excluded from exports, redacted from AI memory,
  and checked by the committed-source scanner in CI.
- Private assets use short-lived authorized reads. Account erasure removes owned
  objects before deleting their database records.
- CI applies every migration to empty PostgreSQL, qualifies automations, scans
  committed source for credential patterns, runs tests/type/build, and rejects
  high-severity production dependency advisories.
- Production changes require readiness, authorization probes, and the relevant
  critical-journey field tests after deployment.
