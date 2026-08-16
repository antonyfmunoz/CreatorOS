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

node scripts/assert-clean-source.mjs
if ($LASTEXITCODE -ne 0) {
  throw "Production releases require a clean source worktree"
}

$releaseTempRoot = Join-Path ([IO.Path]::GetTempPath()) "creativesos-release-$([guid]::NewGuid().ToString('N'))"
$snapshotPath = Join-Path $releaseTempRoot "source"
$archivePath = Join-Path $releaseTempRoot "source.tar"
$locationPushed = $false

try {
  New-Item -ItemType Directory -Path $snapshotPath -Force | Out-Null

  git archive --format=tar --output=$archivePath $sourceCommit
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
    throw "Unable to capture the immutable release source archive"
  }

  tar -xf $archivePath -C $snapshotPath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $snapshotPath "fly.toml"))) {
    throw "Unable to extract the immutable release source snapshot"
  }

  $sourceFingerprint = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sourceFingerprint -notmatch '^[0-9a-f]{64}$') {
    throw "Unable to calculate the release source fingerprint"
  }

  # Re-check the mutable checkout before leaving it behind. Every subsequent
  # migration and build command runs only from the immutable archive snapshot.
  node scripts/assert-clean-source.mjs
  $currentCommit = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $currentCommit -ne $sourceCommit) {
    throw "Release source changed while the immutable snapshot was captured"
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

  Push-Location $snapshotPath
  $locationPushed = $true

  # git archive deliberately excludes node_modules. Hydrate the immutable
  # snapshot from its exact lockfile without running package lifecycle scripts,
  # then use those dependencies for both migration-ledger checks. node_modules
  # remains excluded from the Fly build context by .dockerignore.
  npm ci --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to hydrate immutable release dependencies"
  }

  # Every checked-in migration is additive. Apply and verify the immutable
  # ledger before replacing application machines. Fly's release command remains
  # a second, image-local guard.
  node scripts/migrate-production.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Pre-deployment migration verification failed"
  }

  flyctl deploy . `
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

  # Re-read the production ledger from the exact immutable source released.
  node scripts/migrate-production.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Post-deployment migration verification failed"
  }

  Pop-Location
  $locationPushed = $false

  # Fly health checks prove readiness, while this comparison proves that the
  # immutable source snapshot from this invocation is receiving traffic.
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
} finally {
  if ($locationPushed) {
    Pop-Location
  }

  if (Test-Path -LiteralPath $releaseTempRoot) {
    $resolvedTempRoot = [IO.Path]::GetFullPath($releaseTempRoot)
    $systemTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd(
      [IO.Path]::DirectorySeparatorChar,
      [IO.Path]::AltDirectorySeparatorChar
    ) + [IO.Path]::DirectorySeparatorChar
    $tempLeaf = [IO.Path]::GetFileName($resolvedTempRoot)
    if (
      -not $resolvedTempRoot.StartsWith($systemTempRoot, [StringComparison]::OrdinalIgnoreCase) -or
      -not $tempLeaf.StartsWith("creativesos-release-", [StringComparison]::Ordinal)
    ) {
      throw "Refusing to remove an unsafe release snapshot path"
    }
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}
