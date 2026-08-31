param(
  [string[]]$PlaywrightArgs = @(),
  [string]$Grep = "",
  [switch]$PreflightWorkerResilience,
  [string]$QualificationRoot = ""
)

$ErrorActionPreference = "Stop"

$qualificationRoot = if ($QualificationRoot) {
  $QualificationRoot
} elseif ($env:CREATIVESOS_QUALIFICATION_ROOT) {
  $env:CREATIVESOS_QUALIFICATION_ROOT
} else {
  "C:\tmp"
}
New-Item -ItemType Directory -Path $qualificationRoot -Force | Out-Null
$qualificationRoot = (Resolve-Path -LiteralPath $qualificationRoot).Path.TrimEnd("\")
$qualificationName = "creativesos-browser-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$qualificationPrefix = "$qualificationRoot\creativesos-browser-qualification-"
$databasePath = Join-Path $qualificationPath "postgres"
$runtimeTempPath = Join-Path $qualificationPath "runtime-temp"
$qualificationLog = Join-Path $qualificationPath "postgres.log"
$qualificationPort = Get-Random -Minimum 56000 -Maximum 56999
$priorDatabaseUrl = $env:DATABASE_URL
$priorIsolationFlag = $env:QUALIFICATION_ISOLATED_DATABASE
$priorUploadDirectory = $env:CREATOROS_UPLOAD_DIR
$priorViteCacheDirectory = $env:CREATOROS_VITE_CACHE_DIR
$priorPlaywrightOutputDirectory = $env:PLAYWRIGHT_OUTPUT_DIR
$priorNodeOptions = $env:NODE_OPTIONS
$priorTemp = $env:TEMP
$priorTmp = $env:TMP
$priorTmpDir = $env:TMPDIR
$postgresStarted = $false

if (-not $qualificationPath.StartsWith($qualificationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null
New-Item -ItemType Directory -Path $runtimeTempPath | Out-Null
$qualificationShim = Join-Path $qualificationRoot "$qualificationName-node-os-user-info-shim.cjs"
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "node-os-user-info-shim.cjs") -Destination $qualificationShim
$env:NODE_OPTIONS = "--require=$qualificationShim"
$env:TEMP = $runtimeTempPath
$env:TMP = $runtimeTempPath
$env:TMPDIR = $runtimeTempPath

try {
  & initdb -D $databasePath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable browser database" }
  & pg_ctl -D $databasePath -l $qualificationLog -o "-p $qualificationPort -h 127.0.0.1" -w start
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
  $env:PLAYWRIGHT_OUTPUT_DIR = Join-Path $qualificationPath "playwright-results"
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
  if ($postgresStarted) { & pg_ctl -D $databasePath -m fast -w stop }
  $env:DATABASE_URL = $priorDatabaseUrl
  $env:QUALIFICATION_ISOLATED_DATABASE = $priorIsolationFlag
  $env:CREATOROS_UPLOAD_DIR = $priorUploadDirectory
  $env:CREATOROS_VITE_CACHE_DIR = $priorViteCacheDirectory
  $env:PLAYWRIGHT_OUTPUT_DIR = $priorPlaywrightOutputDirectory
  $env:NODE_OPTIONS = $priorNodeOptions
  $env:TEMP = $priorTemp
  $env:TMP = $priorTmp
  $env:TMPDIR = $priorTmpDir
  if (Test-Path -LiteralPath $qualificationShim) { Remove-Item -LiteralPath $qualificationShim -Force }
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith($qualificationPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
