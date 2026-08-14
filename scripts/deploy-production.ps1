$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:VITE_CLERK_PUBLISHABLE_KEY)) {
  throw "VITE_CLERK_PUBLISHABLE_KEY must be injected before deployment"
}

if (-not $env:VITE_CLERK_PUBLISHABLE_KEY.StartsWith("pk_")) {
  throw "VITE_CLERK_PUBLISHABLE_KEY has an invalid format"
}

# Every checked-in migration is additive. Apply and verify the current source
# ledger before replacing application machines so new code never starts against
# an older schema. Fly's release command remains a second, image-local guard.
node scripts/migrate-production.mjs
if ($LASTEXITCODE -ne 0) {
  throw "Pre-deployment migration verification failed"
}

flyctl deploy `
  --app creatoros-app `
  --remote-only `
  --release-command-timeout 10m `
  --build-arg "VITE_CLERK_PUBLISHABLE_KEY=$env:VITE_CLERK_PUBLISHABLE_KEY"

if ($LASTEXITCODE -ne 0) {
  throw "Fly deployment failed"
}

# Re-read the production ledger from the exact source being released. This
# catches stale or misordered release-command execution instead of allowing a
# successful deploy log to conceal a schema drift condition.
node scripts/migrate-production.mjs
if ($LASTEXITCODE -ne 0) {
  throw "Post-deployment migration verification failed"
}
