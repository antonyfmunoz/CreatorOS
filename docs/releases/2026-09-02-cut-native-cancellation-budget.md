# Native cancellation and codec scheduling

Candidate work; not deployed or a Remotion parity claim.

## Reproduced gap

The b65ba96 measured run retained at
`creativesos-browser-qualification-deb9fa72bb264bb49480affe98c00664`
passed ten complete native/browser workflows but failed both new browser-session
comparison tests at their original 45-second deadline. The process sampler
observed an owned single-input `libx264` medium encode at approximately 2,920 MB
while less than 1 GB of machine memory was free. The lifecycle test submits a
60-second 4K/60 master request specifically to cancel it during preparation.
Inspection found that progress updates could silently affect zero rows and then
start the encoder anyway. The old lease heartbeat could take 100 seconds to kill
it; a direct local kill found no process when cancellation preceded spawn.
This source-level race is confirmed; it does not establish the cause of every
historical screenshot or CI failure.

Protected Verify 33681084260 also failed. Its original failed and retried browser
evidence remains required; no timeout, fixture quality or pixel gate is waived.
Inspection identified HTTP 429 for both still-export tests and the retried text
fitting tests: unrelated suites spent the same user's 12/minute export allowance.
The still-export and text-fitting suites now use separate ordinary qualification
accounts per browser project. Production limits and authorization are unchanged.

## Changes

- Per-job abort state exists before claim/preparation. Native process launch
  rejects a cancelled signal, catches cancellation during registration, and
  retains capacity until the real child closes after kill/timeout.
- Progress updates must still own an unexpired, running lease. A cancellation,
  reassignment or expiration rejects subsequent expensive preparation stages.
- A serialized read-only lease check runs every two seconds while work is active.
  This costs at most 30 reads/minute per active job; it is separate from lease
  extension. Unknown database authority fails closed. Cancellation closes the
  job-owned raster browser too. No new untrusted execution path exists.
- The legacy single-input graph and proxy graph now have the same bounded filter
  scheduling policy as multitrack. Video decoder and encoder defaults are each
  min(2, available CPU count); `CUT_CODEC_THREADS` accepts explicit integers 1–32.
  Raster decoders retain their existing one-thread setting. These are per-codec
  settings, not a process/tenant memory or CPU quota. Existing resolution, FPS,
  CRF, preset, quality thresholds and test deadlines remain unchanged.
- Actual-child tests cover pre-spawn cancellation, cancellation on registration,
  running cancellation, timeout and failed spawn. Actual SQL qualification checks
  cancellation/reassignment/expiration against a running trusted child and
  rejects stale progress without overwriting it. Full-HD decoded-frame and
  master-encode quality checks accompany complete application workflows.

## Qualification boundary

Focused unit tests passed (12). Exact-source root, SQL, measured browser and
protected qualification are pending for this combined candidate. Production
worker/application coordination and actual private output proof remain required.

FFmpeg input/output option placement follows the
[official command documentation](https://ffmpeg.org/ffmpeg.html) and
[codec thread options](https://ffmpeg.org/ffmpeg-codecs.html). Limiting threads
does not guarantee identical lossy bitstreams or broad workload throughput.
