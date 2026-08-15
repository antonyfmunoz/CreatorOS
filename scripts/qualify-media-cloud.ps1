param()

$ErrorActionPreference = "Stop"
$qualificationRoot = "C:\tmp"
$qualificationName = "creativesos-media-qualification-$([guid]::NewGuid().ToString('N'))"
$qualificationPath = Join-Path $qualificationRoot $qualificationName
$qualificationLog = Join-Path $qualificationPath "postgres.log"
$qualificationErrorLog = Join-Path $qualificationPath "postgres-error.log"
$qualificationPort = Get-Random -Minimum 58000 -Maximum 58999
$priorDatabaseUrl = $env:DATABASE_URL
$priorIsolationFlag = $env:QUALIFICATION_ISOLATED_DATABASE
$priorQualificationMode = $env:CREATOROS_QUALIFICATION_MODE
$priorUploadDirectory = $env:CREATOROS_UPLOAD_DIR
$priorStorageProvider = $env:ASSET_STORAGE_PROVIDER
$postgresStarted = $false

if (-not $qualificationPath.StartsWith("C:\tmp\creativesos-media-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected qualification path"
}

New-Item -ItemType Directory -Path $qualificationPath | Out-Null

try {
  & initdb -D $qualificationPath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable Media Cloud database" }
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
    if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $databaseReady) { throw "Disposable Media Cloud database did not become ready" }
  & createdb -h 127.0.0.1 -p $qualificationPort -U postgres creativesos_media
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the disposable Media Cloud database" }

  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$qualificationPort/creativesos_media"
  $env:QUALIFICATION_ISOLATED_DATABASE = "true"
  $env:CREATOROS_QUALIFICATION_MODE = "true"
  $env:ASSET_STORAGE_PROVIDER = "local"
  $env:CREATOROS_UPLOAD_DIR = Join-Path $qualificationPath "uploads"
  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Media Cloud database migration failed" }
  & npx.cmd tsx scripts/seed-browser-qualification.ts
  if ($LASTEXITCODE -ne 0) { throw "Media Cloud fixture setup failed" }
  & npx.cmd tsx scripts/qualify-media-cloud.ts
  if ($LASTEXITCODE -ne 0) { throw "Media Cloud field qualification failed" }
} finally {
  if ($postgresStarted) { & pg_ctl -D $qualificationPath -m fast -w stop | Out-Null }
  $env:DATABASE_URL = $priorDatabaseUrl
  $env:QUALIFICATION_ISOLATED_DATABASE = $priorIsolationFlag
  $env:CREATOROS_QUALIFICATION_MODE = $priorQualificationMode
  $env:CREATOROS_UPLOAD_DIR = $priorUploadDirectory
  $env:ASSET_STORAGE_PROVIDER = $priorStorageProvider
  if (Test-Path -LiteralPath $qualificationPath) {
    $resolvedPath = (Resolve-Path -LiteralPath $qualificationPath).Path
    if ($resolvedPath.StartsWith("C:\tmp\creativesos-media-qualification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
  }
}
