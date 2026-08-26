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
$priorQualificationMode = $env:CREATOROS_QUALIFICATION_MODE
$priorViteQualificationMode = $env:VITE_CREATOROS_QUALIFICATION_MODE
$priorPublicAppUrl = $env:PUBLIC_APP_URL
$priorLoadTestBaseUrl = $env:LOAD_TEST_BASE_URL
$priorLoadTestProfile = $env:LOAD_TEST_PROFILE
$priorLoadTestRequests = $env:LOAD_TEST_REQUESTS
$priorLoadTestConcurrency = $env:LOAD_TEST_CONCURRENCY
$priorSoakTestDurationSeconds = $env:SOAK_TEST_DURATION_SECONDS
$priorSoakTestConcurrency = $env:SOAK_TEST_CONCURRENCY
$priorSoakTestMinimumRequests = $env:SOAK_TEST_MINIMUM_REQUESTS
$priorNodeOptions = $env:NODE_OPTIONS
$databaseStarted = $false
$applicationProcess = $null

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-capacity-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null
$qualificationShim = Join-Path $qualificationRoot "$qualificationName-node-os-user-info-shim.cjs"
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "node-os-user-info-shim.cjs") -Destination $qualificationShim
$env:NODE_OPTIONS = "--require=$qualificationShim"

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
  $env:CREATOROS_DEMO_MODE = "false"
  $env:CREATOROS_QUALIFICATION_MODE = "true"
  $env:VITE_CREATOROS_QUALIFICATION_MODE = "true"
  $env:PUBLIC_APP_URL = "http://127.0.0.1:$applicationPort"
  $env:LOAD_TEST_BASE_URL = $env:PUBLIC_APP_URL
  $env:LOAD_TEST_PROFILE = "mixed"
  $env:LOAD_TEST_REQUESTS = "1600"
  $env:LOAD_TEST_CONCURRENCY = "32"
  $env:SOAK_TEST_DURATION_SECONDS = "30"
  $env:SOAK_TEST_CONCURRENCY = "24"
  $env:SOAK_TEST_MINIMUM_REQUESTS = "5000"

  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Capacity database migration failed" }
  & npx tsx scripts/seed-browser-qualification.ts
  if ($LASTEXITCODE -ne 0) { throw "Capacity database seed failed" }

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
  & node scripts/qualify-http-soak.mjs
  if ($LASTEXITCODE -ne 0) { throw "HTTP soak qualification failed" }
  # Kill and replace the web process while retaining the database, then prove
  # readiness and durable authenticated writes survive the process loss.
  Stop-Process -Id $applicationProcess.Id -Force
  $applicationProcess.WaitForExit()
  $applicationProcess = Start-Process -FilePath "node" -ArgumentList @("dist/index.js") -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput $applicationLog -RedirectStandardError $applicationErrorLog
  $recovered = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    if ($applicationProcess.HasExited) { break }
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "$($env:PUBLIC_APP_URL)/api/ready" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $recovered = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $recovered) { throw "Replacement capacity application did not recover" }
  $durable = Invoke-RestMethod -Uri "$($env:PUBLIC_APP_URL)/api/content-drafts" -Headers @{ "x-creativesos-demo-user" = "1" } -TimeoutSec 5
  if (-not ($durable | Where-Object { $_.content -like "capacity:*" })) { throw "Capacity writes did not survive process replacement" }
  Write-Output '{"schemaVersion":"creativesos.process-chaos-qualification.v1","status":"qualified","processReplacement":true,"readinessRecovered":true,"authenticatedWritesDurable":true}'
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
  $env:CREATOROS_QUALIFICATION_MODE = $priorQualificationMode
  $env:VITE_CREATOROS_QUALIFICATION_MODE = $priorViteQualificationMode
  $env:PUBLIC_APP_URL = $priorPublicAppUrl
  $env:LOAD_TEST_BASE_URL = $priorLoadTestBaseUrl
  $env:LOAD_TEST_PROFILE = $priorLoadTestProfile
  $env:LOAD_TEST_REQUESTS = $priorLoadTestRequests
  $env:LOAD_TEST_CONCURRENCY = $priorLoadTestConcurrency
  $env:SOAK_TEST_DURATION_SECONDS = $priorSoakTestDurationSeconds
  $env:SOAK_TEST_CONCURRENCY = $priorSoakTestConcurrency
  $env:SOAK_TEST_MINIMUM_REQUESTS = $priorSoakTestMinimumRequests
  $env:NODE_OPTIONS = $priorNodeOptions
  if (Test-Path -LiteralPath $qualificationShim) { Remove-Item -LiteralPath $qualificationShim -Force }
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-capacity-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
