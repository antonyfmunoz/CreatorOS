$ErrorActionPreference = "Stop"

foreach ($requiredName in @("DATABASE_URL", "DISTRIBUTION_DISPATCH_SECRET")) {
  $requiredValue = [Environment]::GetEnvironmentVariable($requiredName)
  if ([string]::IsNullOrWhiteSpace($requiredValue)) {
    throw "$requiredName must be injected before deployment"
  }
}

if ([string]::IsNullOrWhiteSpace($env:VITE_CLERK_PUBLISHABLE_KEY)) {
  throw "VITE_CLERK_PUBLISHABLE_KEY must be injected before deployment"
}

if (-not $env:VITE_CLERK_PUBLISHABLE_KEY.StartsWith("pk_")) {
  throw "VITE_CLERK_PUBLISHABLE_KEY has an invalid format"
}

$sourceCommit = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-fA-F]{40,64}$') {
  throw "Unable to resolve the release source commit"
}

$dirtyEntries = @(git status --porcelain=v1 --untracked-files=normal)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to inspect the release source worktree"
}
if ($dirtyEntries.Count -gt 0) {
  $dirtyPaths = $dirtyEntries |
    ForEach-Object { if ($_.Length -gt 3) { $_.Substring(3) } else { $_ } } |
    Sort-Object -Unique
  throw "Production releases require a clean source worktree. Changed paths: $($dirtyPaths -join ', ')"
}

$sourceFingerprint = (node scripts/source-fingerprint.mjs).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceFingerprint -notmatch '^[0-9a-f]{64}$') {
  throw "Unable to calculate the release source fingerprint"
}

$sourceDirty = "false"
$buildTime = (Get-Date).ToUniversalTime().ToString("o")
$buildId = "$(Get-Date -AsUTC -Format 'yyyyMMddTHHmmssZ')-$($sourceFingerprint.Substring(0, 12))"

# A production migration is never attempted without a durable, private backup
# receipt. The endpoint is idempotent for an already-completed UTC-day backup.
$backupHeaders = @{ Authorization = "Bearer $env:DISTRIBUTION_DISPATCH_SECRET" }
$backupReceipt = Invoke-RestMethod `
  -Method Post `
  -Uri "https://creativesos.net/api/internal/operations/backup" `
  -Headers $backupHeaders
if ($backupReceipt.status -ne "completed") {
  throw "Production backup did not return a completed receipt"
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
  --build-arg "VITE_CLERK_PUBLISHABLE_KEY=$env:VITE_CLERK_PUBLISHABLE_KEY" `
  --build-arg "CREATIVESOS_SOURCE_COMMIT=$sourceCommit" `
  --build-arg "CREATIVESOS_SOURCE_FINGERPRINT=$sourceFingerprint" `
  --build-arg "CREATIVESOS_SOURCE_DIRTY=$sourceDirty" `
  --build-arg "CREATIVESOS_BUILD_ID=$buildId" `
  --build-arg "CREATIVESOS_BUILD_TIME=$buildTime"

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

# Fly health checks prove readiness, while this comparison proves that the
# exact source worktree from this invocation is the revision receiving traffic.
$releaseIdentity = Invoke-RestMethod -Method Get -Uri "https://creativesos.net/api/release"
if (
  $releaseIdentity.status -ne "verified" -or
  $releaseIdentity.build.sourceCommit -ne $sourceCommit.ToLowerInvariant() -or
  $releaseIdentity.build.sourceFingerprint -ne $sourceFingerprint -or
  $releaseIdentity.build.sourceDirty -ne $false -or
  $releaseIdentity.build.id -ne $buildId -or
  $releaseIdentity.migrations.parity -ne $true
) {
  throw "Production is not serving the exact qualified release identity"
}
