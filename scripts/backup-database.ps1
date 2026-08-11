param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "DATABASE_URL is required" }

$absoluteDestination = [System.IO.Path]::GetFullPath($Destination)
if ([System.IO.Path]::GetExtension($absoluteDestination) -ne ".dump") {
  throw "Destination must use the .dump extension"
}
$parent = Split-Path -Parent $absoluteDestination
if (-not $parent -or $parent -eq [System.IO.Path]::GetPathRoot($absoluteDestination)) {
  throw "Choose a dedicated backup directory, not a drive root"
}
if (Test-Path -LiteralPath $absoluteDestination) {
  if (-not $Force) { throw "Backup already exists. Pass -Force only after verifying the target." }
  Remove-Item -LiteralPath $absoluteDestination -Force
}
New-Item -ItemType Directory -Path $parent -Force | Out-Null

& pg_dump --dbname $env:DATABASE_URL --format custom --compress 9 --no-owner --no-acl --file $absoluteDestination
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

$file = Get-Item -LiteralPath $absoluteDestination
$hash = Get-FileHash -LiteralPath $absoluteDestination -Algorithm SHA256
$manifestPath = "$absoluteDestination.manifest.json"
$manifest = [ordered]@{
  schemaVersion = "creativesos.backup-manifest.v1"
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  filename = $file.Name
  sizeBytes = $file.Length
  sha256 = $hash.Hash.ToLowerInvariant()
  format = "postgres-custom"
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Output ($manifest | ConvertTo-Json -Compress)
