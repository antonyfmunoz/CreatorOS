# Submitted timeline snapshot: private production field receipt

Public source `7785912c74404b653ed64faba1ebe45b7b5a4fb8` passed production workflow
`33613869521`, attempt 2. The release job passed 578 unit tests and 257 browser
journeys, with 24 skipped and one flaky native-text-layout journey. Its retry
passed; that does not establish that the initial rendering failure is fixed.
PR 143 subsequently added terminal-state diagnostics without enlarging the
60-second polling budget. Those diagnostics are not yet in this public release.

Independent readiness reported `release_ready`, clean verified source identity,
build `20260902T102159Z-791e2941c783`, and all 120 expected migrations present.
The ordinary GCP worker was built and updated from the same source before this
field run: build `21bae2f9-1ede-4f15-b02b-9f090d4ac3fb`, immutable image
`sha256:d85683f85cb8217a770922822dbc97947ef30cc7b736c7fad5a880a90b373cd0`.
Its CPU/memory/tasks, credentials and IAM topology were unchanged.

## Actual signed-in workflow and independent artifact

In the owned private three-second GCP test project, V1 gain was saved at 0.25.
A portrait 720p/draft, 30-FPS original-audio render was submitted, then the same
project's gain was immediately changed and saved at 0.5 while the job was queued.
The submitted job completed and the private browser preview loaded successfully.

- Job: `bd4f7719-c565-4f06-bcbe-cf9f31c08f1a`.
- Private artifact: `be42045d-86ee-43c6-b459-76395736a530`.
- Conditional R2 read: 292,519 bytes, SHA-256
  `2ad413fc47a2e7d3c25803d2a7e35bba5142134c100f9615c5e1a87895507ef9`.
- Independent decode: H.264, 406x720, square pixels, 30 FPS, 90 frames, exactly
  three seconds; AAC soundtrack also three seconds.
- Decoded PCM over seconds 0.4..2.6: prior unity-gain reference RMS
  `0.08847217799525225`; submitted-snapshot RMS `0.022115648563502708`;
  ratio `0.24997291877102332`. This matches the submitted quarter gain, not the
  later saved half gain, within the explicit 0.025 tolerance.
- Decoded frame 30 was visually reviewed: the private Noto Sans title remained
  complete on two lines inside its blue card, without clipping.
- The test project's V1 gain was restored to 1 and the UI confirmed Saved.

No public content was published or removed. Credentials, signed URLs and private
source contents are not included in the committed receipt. Local video, frames
and machine-readable receipt are retained at
`B:/CreativesOS-task-artifacts/production-snapshot-7785912`.

## Original execution-identity gate and recovered management evidence

Google's human management credentials expired during this run; both existing
Cloud sign-in tabs require a password. The app's independent service-account
dispatcher continued to work and the actual output was retrieved and verified.
The exact Cloud Run execution ID/image receipt for this particular job has not
been inspected. The earlier verified job configuration is not a substitute for
that execution receipt. Management reauthentication is required to finish this
check and promote later worker source. This document does not claim full
production-chain closure, public TSX execution or general Remotion parity.

Management access succeeded again on 2026-09-02 at approximately 20:32 UTC.
The dispatch log binds this owned job to operation
`6e8e57ef-468f-4eb8-a6d6-dc1f4ff58e76`. The completed operation response identifies
execution `creativesos-cut-worker-bv7tv`, the exact image digest above, one
successful task and completion at `2026-09-02T10:32:31.875437Z`. Its worker log
records one processed job at `10:32:26.883473Z`, with the same source label.
The sanitized independent receipt is retained as
`production-snapshot-7785912/execution-receipt.json`. This closes the missing
dispatch-to-execution/image inspection; it is not a new deployment or render.

The historical worker did not emit individual claim IDs and reported the
nonunique fallback `localhost:1:cut`. A follow-up adds execution/task/attempt
identity and per-claim correlation for future releases. Those improvements
still need exact-source production proof; the historical receipt is not
retroactively upgraded to a claim-level trace.
