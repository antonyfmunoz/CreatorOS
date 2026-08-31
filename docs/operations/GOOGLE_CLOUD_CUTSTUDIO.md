# Google Cloud CutStudio render plane

CreativesOS keeps the application, database authority and canonical private
media in the existing Fly, Neon and R2 stack. Google Cloud supplies an isolated,
scale-to-zero render plane; it does not become a second application database or
the permanent media system.

## Request path

1. The signed-in CreativesOS API validates ownership, duration and concurrency,
   inserts a durable `cut_studio_jobs` row and sends an HMAC-authenticated,
   replay-bounded dispatch request.
2. The public Cloud Run dispatcher validates the application signature. Its
   dedicated service account has only permission to execute one named Cloud Run
   job.
3. Each Cloud Run Job execution starts one worker, claims at most one queued job
   through the existing database lease, materializes private input from R2,
   renders with FFmpeg and writes the private result back to R2.
4. Existing job polling, cancellation, retry, lineage, review and Distribution
   Studio handoff continue to use the native CreativesOS contracts.

Duplicate dispatches are safe: the dispatcher rejects short-window replay and
the database compare-and-set lease prevents two workers from owning one job.
The worker has no public HTTP endpoint. The dispatcher never receives database
or R2 credentials.

## Cost and scale boundaries

- Google billing budget: `CreativesOS render guardrail`, $25 per month, scoped
  to `creativesos-504623`, alerts at 50%, 75%, 90% and 100%.
- Dispatcher: zero minimum instances, maximum two, 256 MiB, concurrency 20.
- Render job: one task per execution, one retry, two vCPU, 4 GiB, two-hour
  timeout and one claimed render at a time.
- The existing per-user active-job limit remains two. Larger 4K/GPU tiers must
  be introduced as distinct governed profiles after measured workload evidence;
  they are not silently enabled.

## Secret custody

`scripts/sync-gcp-cutstudio-secrets.ps1` streams values from the CreativesOS
1Password vault directly into Secret Manager. It does not print or write
plaintext values to the repository. Runtime service accounts receive access
only to the secrets their container consumes.

## Deployment

Run from a clean, committed release candidate:

```powershell
./scripts/sync-gcp-cutstudio-secrets.ps1
./scripts/provision-gcp-cutstudio.ps1
```

The provisioning script enables the required APIs, creates the private
Artifact Registry repository and dedicated identities, builds the immutable
source commit, deploys the worker job and dispatcher, and prints the resulting
dispatch URL. Configure Fly with that URL and the same vault-backed dispatch
secret before setting `CUT_STUDIO_PROCESSING_MODE=external`.

Do not call the render plane production-complete until a real signed-in
upload-to-render-to-private-download journey passes against the exact deployed
web and worker revisions and the job execution/log receipt is retained.

