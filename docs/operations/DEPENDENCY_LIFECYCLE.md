# Dependency lifecycle

Every dependency change is release work, not clerical work. Patch and minor
updates may be grouped only when the lockfile remains deterministic and the
complete core, database, browser, Android, and iOS matrix passes. Major
updates are isolated by ecosystem and require a migration note plus rollback.

## Current boundary

- GitHub `actions/checkout` and `actions/setup-node` are qualified at v7.
- Production and development package updates must remain within the declared
  semver ranges unless a dedicated migration changes the range.
- Zod 4, Express 5, React 19, Vite 8, Tailwind 4, OpenAI 7, and other major
  lines are intentionally excluded from grouped dependency maintenance. Each
  changes runtime or type contracts and requires its own verified migration.
- Dependabot PRs that combine incompatible major lines are superseded by this
  policy; they are not evidence that the application itself is unhealthy.

## Cadence and evidence

1. Weekly: review advisories, `npm audit --omit=dev`, and compatible updates.
2. Monthly: run the full native and browser matrix on accumulated minor work.
3. Quarterly: select at most one major ecosystem migration per release train.
4. Emergency: isolate a vulnerable package, patch or constrain it, and run the
   same release gates before deployment. Never suppress a high-severity audit.

The protected release workflow verifies secrets, source cleanliness, the
Stitch reference manifest, scale manifests, application tests, migrations,
worker recovery, and mobile/browser compilation before deployment.
