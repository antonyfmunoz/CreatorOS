param(
  [string]$Project = "creativesos-504623",
  [string]$Region = "us-central1",
  [string]$Repository = "creativesos-render",
  [string]$Gcloud = "$env:LOCALAPPDATA\GoogleCloudCLI-579\google-cloud-sdk\bin\gcloud.cmd"
)

$ErrorActionPreference = "Stop"
$WorkerJob = "creativesos-cut-worker"
$DispatcherService = "creativesos-cut-dispatch"
$WorkerServiceAccountName = "creativesos-cut-worker"
$DispatcherServiceAccountName = "creativesos-cut-dispatch"
$requiredSecrets = @(
  "creativesos-cut-dispatch-secret",
  "creativesos-database-url",
  "creativesos-r2-account-id",
  "creativesos-r2-access-key-id",
  "creativesos-r2-secret-access-key",
  "creativesos-r2-private-bucket"
)

if (-not (Test-Path -LiteralPath $Gcloud)) { throw "Google Cloud CLI was not found at $Gcloud" }
if ((git status --porcelain).Length -ne 0) { throw "Provisioning requires a committed, clean source worktree" }

function Invoke-Gcloud([string[]]$Arguments) {
  & $Gcloud @Arguments
  if ($LASTEXITCODE -ne 0) { throw "gcloud command failed: $($Arguments -join ' ')" }
}

Invoke-Gcloud @("config", "set", "project", $Project)
Invoke-Gcloud @("config", "set", "run/region", $Region)
Invoke-Gcloud @("services", "enable", "run.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "secretmanager.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com", "cloudresourcemanager.googleapis.com", "--project", $Project)

& $Gcloud artifacts repositories describe $Repository --location $Region --project $Project --format "value(name)" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Invoke-Gcloud @("artifacts", "repositories", "create", $Repository, "--repository-format", "docker", "--location", $Region, "--description", "Private CreativesOS render images", "--project", $Project)
}

foreach ($name in @($WorkerServiceAccountName, $DispatcherServiceAccountName)) {
  & $Gcloud iam service-accounts describe "$name@$Project.iam.gserviceaccount.com" --project $Project --format "value(email)" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Invoke-Gcloud @("iam", "service-accounts", "create", $name, "--display-name", $name, "--project", $Project)
  }
}

foreach ($name in $requiredSecrets) {
  & $Gcloud secrets describe $name --project $Project --format "value(name)" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Required secret $name is missing. Run scripts/sync-gcp-cutstudio-secrets.ps1 first." }
}

$workerEmail = "$WorkerServiceAccountName@$Project.iam.gserviceaccount.com"
$dispatcherEmail = "$DispatcherServiceAccountName@$Project.iam.gserviceaccount.com"
foreach ($name in $requiredSecrets | Where-Object { $_ -ne "creativesos-cut-dispatch-secret" }) {
  Invoke-Gcloud @("secrets", "add-iam-policy-binding", $name, "--project", $Project, "--member", "serviceAccount:$workerEmail", "--role", "roles/secretmanager.secretAccessor", "--quiet")
}
Invoke-Gcloud @("secrets", "add-iam-policy-binding", "creativesos-cut-dispatch-secret", "--project", $Project, "--member", "serviceAccount:$dispatcherEmail", "--role", "roles/secretmanager.secretAccessor", "--quiet")

$projectNumber = (& $Gcloud projects describe $Project --format "value(projectNumber)").Trim()
if (-not $projectNumber) { throw "Unable to resolve the Google Cloud project number" }
$buildServiceAccount = (& $Gcloud builds get-default-service-account --project $Project --format "value(serviceAccountEmail)" 2>$null).Trim()
if (-not $buildServiceAccount) { $buildServiceAccount = "$projectNumber-compute@developer.gserviceaccount.com" }
foreach ($role in @("roles/artifactregistry.writer", "roles/logging.logWriter")) {
  Invoke-Gcloud @("projects", "add-iam-policy-binding", $Project, "--member", "serviceAccount:$buildServiceAccount", "--role", $role, "--condition", "None", "--quiet")
}

$commit = (git rev-parse HEAD).Trim()
$image = "$Region-docker.pkg.dev/$Project/$Repository/cutstudio:$commit"
Invoke-Gcloud @("builds", "submit", ".", "--project", $Project, "--config", "cloudbuild.cutstudio.yaml", "--substitutions", "_IMAGE=$image", "--quiet")

$workerSecrets = "DATABASE_URL=creativesos-database-url:latest,R2_ACCOUNT_ID=creativesos-r2-account-id:latest,R2_ACCESS_KEY_ID=creativesos-r2-access-key-id:latest,R2_SECRET_ACCESS_KEY=creativesos-r2-secret-access-key:latest,R2_PRIVATE_BUCKET_NAME=creativesos-r2-private-bucket:latest"
Invoke-Gcloud @("run", "jobs", "deploy", $WorkerJob, "--project", $Project, "--region", $Region, "--image", $image, "--service-account", $workerEmail, "--cpu", "2", "--memory", "4Gi", "--task-timeout", "7200s", "--max-retries", "1", "--tasks", "1", "--set-env-vars", "NODE_ENV=production,ASSET_STORAGE_PROVIDER=r2,CUT_STUDIO_PROCESSING_MODE=external,CUT_WORKER_RUN_ONCE=true,CUT_WORKER_REGION=$Region,CUT_WORKER_CONCURRENCY=1", "--set-secrets", $workerSecrets, "--quiet")
Invoke-Gcloud @("run", "jobs", "add-iam-policy-binding", $WorkerJob, "--project", $Project, "--region", $Region, "--member", "serviceAccount:$dispatcherEmail", "--role", "roles/run.invoker", "--quiet")

Invoke-Gcloud @("run", "deploy", $DispatcherService, "--project", $Project, "--region", $Region, "--image", $image, "--service-account", $dispatcherEmail, "--command", "node", "--args", "dist/cut-cloud-dispatch.js", "--cpu", "1", "--memory", "256Mi", "--min-instances", "0", "--max-instances", "2", "--concurrency", "20", "--timeout", "30s", "--set-env-vars", "NODE_ENV=production,CUT_CLOUD_PROJECT=$Project,CUT_CLOUD_REGION=$Region,CUT_CLOUD_JOB_NAME=$WorkerJob", "--set-secrets", "CUT_CLOUD_DISPATCH_SECRET=creativesos-cut-dispatch-secret:latest", "--allow-unauthenticated", "--quiet")

$dispatcherUrl = (& $Gcloud run services describe $DispatcherService --project $Project --region $Region --format "value(status.url)").Trim()
if (-not $dispatcherUrl) { throw "Cloud Run did not return a dispatcher URL" }
Write-Output "CUT_CLOUD_DISPATCH_URL=$dispatcherUrl/dispatch"
Write-Output "IMAGE=$image"
Write-Output "Deploy the URL and the same vault-backed dispatch secret to Fly before switching CUT_STUDIO_PROCESSING_MODE to external."
