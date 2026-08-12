param()

$ErrorActionPreference = "Stop"
$qualificationRoot = "C:\tmp"
$qualificationName = "creativesos-migration-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$qualificationLog = Join-Path $qualificationPath "postgres.log"
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
  & pg_ctl -D $qualificationPath -l $qualificationLog -o "-p $qualificationPort -h 127.0.0.1" -w start | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the disposable migration database" }
  $postgresStarted = $true
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
