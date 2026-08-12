param()

$ErrorActionPreference = "Stop"
$qualificationRoot = "C:\tmp"
$qualificationName = "creativesos-migration-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$qualificationLog = Join-Path $qualificationPath "postgres.log"
$qualificationErrorLog = Join-Path $qualificationPath "postgres-error.log"
$qualificationPort = Get-Random -Minimum 57000 -Maximum 57999
$priorDatabaseUrl = $env:DATABASE_URL
$postgresStarted = $false

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-migration-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null

try {
  & initdb -D $qualificationPath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable migration database" }
  # Launch the disposable server independently. On Windows, pg_ctl start can
  # keep its child attached to a captured stdout handle even after PostgreSQL
  # is ready, which makes CI wrappers wait forever.
  $postgresBinary = (Get-Command postgres -ErrorAction Stop).Source
  $postgresProcess = Start-Process `
    -FilePath $postgresBinary `
    -ArgumentList @("-D", "`"$qualificationPath`"", "-p", "$qualificationPort", "-h", "127.0.0.1") `
    -WindowStyle Hidden `
    -RedirectStandardOutput $qualificationLog `
    -RedirectStandardError $qualificationErrorLog `
    -PassThru
  $postgresStarted = $true
  $databaseReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    & pg_isready -h 127.0.0.1 -p $qualificationPort -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $databaseReady = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $databaseReady) { throw "Disposable migration database did not become ready" }
  & createdb -h 127.0.0.1 -p $qualificationPort -U postgres creativesos_migrations
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the disposable migration database" }
  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$qualificationPort/creativesos_migrations"
  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Migration qualification failed" }
} finally {
  $env:DATABASE_URL = $priorDatabaseUrl
  if ($postgresStarted) { & pg_ctl -D $qualificationPath -m fast -w stop | Out-Null }
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-migration-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
