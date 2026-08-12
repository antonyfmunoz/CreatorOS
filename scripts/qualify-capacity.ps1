$ErrorActionPreference = "Stop"

$qualificationRoot = "C:\tmp"
$qualificationName = "creativesos-capacity-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$databaseLog = Join-Path $qualificationPath "postgres.log"
$applicationLog = Join-Path $qualificationPath "application.log"
$applicationErrorLog = Join-Path $qualificationPath "application-error.log"
$databasePort = Get-Random -Minimum 58000 -Maximum 58499
$applicationPort = Get-Random -Minimum 58500 -Maximum 58999
$priorDatabaseUrl = $env:DATABASE_URL
$priorIsolationFlag = $env:QUALIFICATION_ISOLATED_DATABASE
$priorPort = $env:PORT
$priorDemoMode = $env:CREATOROS_DEMO_MODE
$priorPublicAppUrl = $env:PUBLIC_APP_URL
$priorLoadTestBaseUrl = $env:LOAD_TEST_BASE_URL
$databaseStarted = $false
$applicationProcess = $null

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-capacity-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null

try {
  & initdb -D $qualificationPath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable capacity database" }
  & pg_ctl -D $qualificationPath -l $databaseLog -o "-p $databasePort -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the disposable capacity database" }
  $databaseStarted = $true
  & createdb -h 127.0.0.1 -p $databasePort -U postgres creativesos_capacity
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the disposable capacity database" }

  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$databasePort/creativesos_capacity"
  $env:QUALIFICATION_ISOLATED_DATABASE = "true"
  $env:PORT = [string]$applicationPort
  $env:CREATOROS_DEMO_MODE = "true"
  $env:PUBLIC_APP_URL = "http://127.0.0.1:$applicationPort"
  $env:LOAD_TEST_BASE_URL = $env:PUBLIC_APP_URL

  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Capacity database migration failed" }

  $applicationProcess = Start-Process -FilePath "node" -ArgumentList @("dist/index.js") -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput $applicationLog -RedirectStandardError $applicationErrorLog
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    if ($applicationProcess.HasExited) { break }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "$($env:PUBLIC_APP_URL)/api/ready" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    $details = if (Test-Path -LiteralPath $applicationErrorLog) { Get-Content -LiteralPath $applicationErrorLog -Raw } else { "No application error log was created." }
    throw "Capacity application did not become ready. $details"
  }

  & node scripts/qualify-http-capacity.mjs
  if ($LASTEXITCODE -ne 0) { throw "HTTP capacity qualification failed" }
} finally {
  if ($applicationProcess -and -not $applicationProcess.HasExited) {
    Stop-Process -Id $applicationProcess.Id -Force
    $applicationProcess.WaitForExit()
  }
  if ($databaseStarted) { & pg_ctl -D $qualificationPath -m fast -w stop | Out-Null }
  $env:DATABASE_URL = $priorDatabaseUrl
  $env:QUALIFICATION_ISOLATED_DATABASE = $priorIsolationFlag
  $env:PORT = $priorPort
  $env:CREATOROS_DEMO_MODE = $priorDemoMode
  $env:PUBLIC_APP_URL = $priorPublicAppUrl
  $env:LOAD_TEST_BASE_URL = $priorLoadTestBaseUrl
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-capacity-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
