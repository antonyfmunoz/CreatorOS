$ErrorActionPreference = "Stop"

$qualificationRoot = "C:\tmp"
$qualificationPath = Join-Path $qualificationRoot "creativesos-worker-resilience-$([guid]::NewGuid().ToString('N'))"
$databaseLog = Join-Path $qualificationPath "postgres.log"
$databasePort = Get-Random -Minimum 59000 -Maximum 59499
$priorDatabaseUrl = $env:DATABASE_URL
$priorIsolationFlag = $env:QUALIFICATION_ISOLATED_DATABASE
$databaseStarted = $false

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-worker-resilience-", [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to use an unexpected qualification path" }
New-Item -ItemType Directory -Path $qualificationPath | Out-Null

try {
  & initdb -D $qualificationPath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the worker-resilience database" }
  & pg_ctl -D $qualificationPath -l $databaseLog -o "-p $databasePort -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the worker-resilience database" }
  $databaseStarted = $true
  & createdb -h 127.0.0.1 -p $databasePort -U postgres creativesos_worker_resilience
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the worker-resilience database" }
  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$databasePort/creativesos_worker_resilience"
  $env:QUALIFICATION_ISOLATED_DATABASE = "true"
  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Worker-resilience migration failed" }
  & npx tsx scripts/qualify-worker-resilience.ts
  if ($LASTEXITCODE -ne 0) { throw "Worker-resilience qualification failed" }
} finally {
  if ($databaseStarted) { & pg_ctl -D $qualificationPath -m fast -w stop | Out-Null }
  $env:DATABASE_URL = $priorDatabaseUrl
  $env:QUALIFICATION_ISOLATED_DATABASE = $priorIsolationFlag
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-worker-resilience-", [System.StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolvedPath -Recurse -Force }
  }
}
