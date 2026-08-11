param(
  [string[]]$PlaywrightArgs = @()
)

$ErrorActionPreference = "Stop"

$qualificationRoot = "C:\tmp"
$qualificationName = "creativesos-browser-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$qualificationLog = Join-Path $qualificationPath "postgres.log"
$qualificationPort = Get-Random -Minimum 56000 -Maximum 56999
$priorDatabaseUrl = $env:DATABASE_URL
$priorIsolationFlag = $env:QUALIFICATION_ISOLATED_DATABASE
$postgresStarted = $false

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-browser-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null

try {
  & initdb -D $qualificationPath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable browser database" }
  & pg_ctl -D $qualificationPath -l $qualificationLog -o "-p $qualificationPort -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the disposable browser database" }
  $postgresStarted = $true
  & createdb -h 127.0.0.1 -p $qualificationPort -U postgres creativesos_browser
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the disposable browser database" }

  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$qualificationPort/creativesos_browser"
  $env:QUALIFICATION_ISOLATED_DATABASE = "true"
  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Browser database migration failed" }
  & npx.cmd playwright test @PlaywrightArgs
  if ($LASTEXITCODE -ne 0) { throw "Browser qualification failed" }
} finally {
  if ($postgresStarted) { & pg_ctl -D $qualificationPath -m fast -w stop }
  $env:DATABASE_URL = $priorDatabaseUrl
  $env:QUALIFICATION_ISOLATED_DATABASE = $priorIsolationFlag
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-browser-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
