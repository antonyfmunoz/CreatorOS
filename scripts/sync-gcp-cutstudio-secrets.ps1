param(
  [string]$Project = "creativesos-504623",
  [string]$Gcloud = "$env:LOCALAPPDATA\GoogleCloudCLI-579\google-cloud-sdk\bin\gcloud.cmd",
  [string]$Vault = "CreativesOS"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Gcloud)) { throw "Google Cloud CLI was not found at $Gcloud" }
if (-not (Get-Command op -ErrorAction SilentlyContinue)) { throw "1Password CLI is required" }

function Invoke-Gcloud([string[]]$Arguments) {
  & $Gcloud @Arguments
  if ($LASTEXITCODE -ne 0) { throw "gcloud command failed" }
}

function Test-Gcloud([string[]]$Arguments) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    & $Gcloud @Arguments 1>$null 2>$null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Ensure-Secret([string]$Name) {
  if (-not (Test-Gcloud @("secrets", "describe", $Name, "--project", $Project, "--format", "value(name)"))) {
    Invoke-Gcloud @("secrets", "create", $Name, "--project", $Project, "--replication-policy", "automatic")
  }
}

function Add-SecretVersion([string]$Name, [string]$Reference) {
  Ensure-Secret $Name
  $opPath = (Get-Command op).Source
  $command = '"{0}" read "{1}" | "{2}" secrets versions add "{3}" --project "{4}" --data-file=- --quiet' -f $opPath, $Reference, $Gcloud, $Name, $Project
  & $env:ComSpec /d /s /c $command | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Unable to sync $Name from 1Password" }
  Write-Output "Synced $Name"
}

& op item get "Google Cloud CutStudio" --vault $Vault --format json 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  & op item create --category password --title "Google Cloud CutStudio" --vault $Vault --generate-password=letters,digits,64 --tags "CreativesOS,Google Cloud,CutStudio" 1>$null
  if ($LASTEXITCODE -ne 0) { throw "Unable to create the Google Cloud CutStudio vault item" }
}

$secretReferences = @{
  "creativesos-cut-dispatch-secret" = "op://$Vault/Google Cloud CutStudio/password"
  "creativesos-database-url" = "op://$Vault/Development/DATABASE_URL"
  "creativesos-r2-account-id" = "op://$Vault/Development/R2_ACCOUNT_ID"
  "creativesos-r2-access-key-id" = "op://$Vault/Development/R2_ACCESS_KEY_ID"
  "creativesos-r2-secret-access-key" = "op://$Vault/Development/R2_SECRET_ACCESS_KEY"
  "creativesos-r2-private-bucket" = "op://$Vault/Development/R2_PRIVATE_BUCKET_NAME"
}

foreach ($entry in $secretReferences.GetEnumerator()) {
  Add-SecretVersion $entry.Key $entry.Value
}

Write-Output "CutStudio Google Cloud secrets are synchronized without writing plaintext values to disk."
