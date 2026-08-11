$ErrorActionPreference = "Stop"

$qualificationRoot = "C:\tmp"
$qualificationName = "creativesos-pg-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$qualificationLog = Join-Path $qualificationPath "postgres.log"
$qualificationPort = Get-Random -Minimum 55432 -Maximum 55999
$priorDatabaseUrl = $env:DATABASE_URL
$priorIsolationFlag = $env:QUALIFICATION_ISOLATED_DATABASE
$postgresStarted = $false

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-pg-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null

try {
  & initdb -D $qualificationPath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable PostgreSQL cluster" }

  & pg_ctl -D $qualificationPath -l $qualificationLog -o "-p $qualificationPort -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the disposable PostgreSQL cluster" }
  $postgresStarted = $true

  & createdb -h 127.0.0.1 -p $qualificationPort -U postgres creativesos_qualification
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the disposable qualification database" }

  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$qualificationPort/creativesos_qualification"
  $env:QUALIFICATION_ISOLATED_DATABASE = "true"

  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Clean migration qualification failed" }

  & npx.cmd tsx scripts/qualify-relationship-operations.ts
  if ($LASTEXITCODE -ne 0) { throw "Relationship operations qualification failed" }
} finally {
  if ($postgresStarted) {
    & pg_ctl -D $qualificationPath -m fast -w stop
  }
  $env:DATABASE_URL = $priorDatabaseUrl
  $env:QUALIFICATION_ISOLATED_DATABASE = $priorIsolationFlag
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-pg-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
