param(
  [string[]]$PlaywrightArgs = @(),
  [string]$Grep = "",
  [switch]$PreflightWorkerResilience
)

$ErrorActionPreference = "Stop"

$qualificationRoot = "C:\tmp"
$qualificationName = "creativesos-browser-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$qualificationLog = Join-Path $qualificationPath "postgres.log"
$qualificationPort = Get-Random -Minimum 56000 -Maximum 56999
$priorDatabaseUrl = $env:DATABASE_URL
$priorIsolationFlag = $env:QUALIFICATION_ISOLATED_DATABASE
$priorUploadDirectory = $env:CREATOROS_UPLOAD_DIR
$priorViteCacheDirectory = $env:CREATOROS_VITE_CACHE_DIR
$postgresStarted = $false

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-browser-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null

try {
  & initdb -D $qualificationPath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable browser database" }
  & pg_ctl -D $qualificationPath -l $qualificationLog -o "-p $qualificationPort -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $qualificationLog) {
      Write-Error "Disposable browser database log:`n$(Get-Content -LiteralPath $qualificationLog -Raw)"
    }
    throw "Failed to start the disposable browser database"
  }
  $postgresStarted = $true
  & createdb -h 127.0.0.1 -p $qualificationPort -U postgres creativesos_browser
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the disposable browser database" }

  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$qualificationPort/creativesos_browser"
  $env:QUALIFICATION_ISOLATED_DATABASE = "true"
  $env:CREATOROS_UPLOAD_DIR = Join-Path $qualificationPath "uploads"
  $env:CREATOROS_VITE_CACHE_DIR = Join-Path $qualificationPath "vite-cache"
  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Browser database migration failed" }
  if ($PreflightWorkerResilience) {
    & npx.cmd tsx scripts/qualify-worker-resilience.ts
    if ($LASTEXITCODE -ne 0) { throw "Worker resilience qualification failed before browser seeding" }
  }
  & npx.cmd tsx scripts/seed-browser-qualification.ts
  if ($LASTEXITCODE -ne 0) { throw "Browser qualification fixture setup failed" }
  $playwrightArguments = @($PlaywrightArgs)
  if ($Grep) { $playwrightArguments += @("--grep", $Grep) }
  & npx.cmd playwright test @playwrightArguments
  if ($LASTEXITCODE -ne 0) { throw "Browser qualification failed" }
} finally {
  if ($postgresStarted) { & pg_ctl -D $qualificationPath -m fast -w stop }
  $env:DATABASE_URL = $priorDatabaseUrl
  $env:QUALIFICATION_ISOLATED_DATABASE = $priorIsolationFlag
  $env:CREATOROS_UPLOAD_DIR = $priorUploadDirectory
  $env:CREATOROS_VITE_CACHE_DIR = $priorViteCacheDirectory
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-browser-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
