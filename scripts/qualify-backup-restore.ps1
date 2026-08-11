$ErrorActionPreference = "Stop"

$root = "C:\tmp"
$id = [guid]::NewGuid().ToString("N")
$databasePath = Join-Path $root "creativesos-backup-source-$id"
$artifactPath = Join-Path $root "creativesos-backup-artifact-$id"
$dumpPath = Join-Path $artifactPath "qualification.dump"
$logPath = Join-Path $databasePath "postgres.log"
$port = Get-Random -Minimum 57000 -Maximum 57999
$priorDatabaseUrl = $env:DATABASE_URL
$started = $false

if (-not $databasePath.StartsWith("C:\tmp\creativesos-backup-source-", [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected source path" }
if (-not $artifactPath.StartsWith("C:\tmp\creativesos-backup-artifact-", [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected artifact path" }

New-Item -ItemType Directory -Path $databasePath | Out-Null
New-Item -ItemType Directory -Path $artifactPath | Out-Null

try {
  & initdb -D $databasePath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize backup source" }
  & pg_ctl -D $databasePath -l $logPath -o "-p $port -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) { throw "Failed to start backup source" }
  $started = $true
  & createdb -h 127.0.0.1 -p $port -U postgres creativesos_backup
  if ($LASTEXITCODE -ne 0) { throw "Failed to create backup source database" }
  $env:DATABASE_URL = "postgresql://postgres@127.0.0.1:$port/creativesos_backup"
  & node scripts/migrate-qualification.mjs
  if ($LASTEXITCODE -ne 0) { throw "Backup source migration failed" }
  & psql -h 127.0.0.1 -p $port -U postgres -d creativesos_backup -v ON_ERROR_STOP=1 -c "insert into users (clerk_id, username, display_name) values ('backup_qualification', 'backup_qualification', 'Backup qualification')" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Backup source fixture failed" }

  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-database.ps1 -Destination $dumpPath
  if ($LASTEXITCODE -ne 0) { throw "Backup creation failed" }
  $manifestPath = "$dumpPath.manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Backup manifest missing" }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $actualHash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($manifest.sha256 -ne $actualHash) { throw "Backup manifest hash mismatch" }

  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-backup-restore.ps1 -BackupFile $dumpPath
  if ($LASTEXITCODE -ne 0) { throw "Backup restore verification failed" }
  Write-Output (@{ status = "backup_restore_qualified"; manifestVerified = $true; sourceFixture = $true } | ConvertTo-Json -Compress)
} finally {
  if ($started) { & pg_ctl -D $databasePath -m fast -w stop | Out-Null }
  $env:DATABASE_URL = $priorDatabaseUrl
  foreach ($candidate in @($databasePath, $artifactPath)) {
    if (Test-Path -LiteralPath $candidate) {
      $resolved = (Resolve-Path -LiteralPath $candidate).Path
      if ($resolved.StartsWith("C:\tmp\creativesos-backup-", [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
      }
    }
  }
}
