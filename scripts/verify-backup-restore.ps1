param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"
$backupPath = [System.IO.Path]::GetFullPath($BackupFile)
if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { throw "Backup file was not found" }

$restoreRoot = "C:\tmp"
$restoreName = "creativesos-restore-verification-$([guid]::NewGuid().ToString('N'))"
$restorePath = Join-Path $restoreRoot $restoreName
$restoreLog = Join-Path $restorePath "postgres.log"
$restorePort = Get-Random -Minimum 56000 -Maximum 56999
$started = $false

if (-not $restorePath.StartsWith("C:\tmp\creativesos-restore-verification-", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an unexpected restore path"
}
New-Item -ItemType Directory -Path $restorePath | Out-Null

try {
  & initdb -D $restorePath -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to initialize the disposable restore cluster" }
  & pg_ctl -D $restorePath -l $restoreLog -o "-p $restorePort -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) { throw "Failed to start the disposable restore cluster" }
  $started = $true
  & createdb -h 127.0.0.1 -p $restorePort -U postgres creativesos_restore
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the disposable restore database" }
  & pg_restore --host 127.0.0.1 --port $restorePort --username postgres --dbname creativesos_restore --no-owner --no-acl $backupPath
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }

  $required = @("users", "businesses", "posts", "products", "communities", "orders", "automation_definitions", "relationships", "account_privacy_requests")
  $quoted = ($required | ForEach-Object { "'$_'" }) -join ","
  $present = & psql -h 127.0.0.1 -p $restorePort -U postgres -d creativesos_restore -Atc "select count(*) from information_schema.tables where table_schema='public' and table_name in ($quoted)"
  if ($LASTEXITCODE -ne 0 -or [int]$present -ne $required.Count) { throw "Restored database is missing required tables" }
  $orphanMessages = & psql -h 127.0.0.1 -p $restorePort -U postgres -d creativesos_restore -Atc "select count(*) from direct_messages dm left join conversations c on c.id=dm.conversation_id where c.id is null"
  if ($LASTEXITCODE -ne 0 -or [int]$orphanMessages -ne 0) { throw "Restored database contains orphan direct messages" }
  $migrationCount = & psql -h 127.0.0.1 -p $restorePort -U postgres -d creativesos_restore -Atc 'select count(*) from drizzle.__drizzle_migrations'
  Write-Output (@{ status = "restore_verified"; requiredTables = $required.Count; migrationCount = [int]$migrationCount; orphanDirectMessages = [int]$orphanMessages } | ConvertTo-Json -Compress)
} finally {
  if ($started) { & pg_ctl -D $restorePath -m fast -w stop | Out-Null }
  if (Test-Path -LiteralPath $restorePath) {
    $resolved = (Resolve-Path -LiteralPath $restorePath).Path
    if ($resolved.StartsWith("C:\tmp\creativesos-restore-verification-", [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}
