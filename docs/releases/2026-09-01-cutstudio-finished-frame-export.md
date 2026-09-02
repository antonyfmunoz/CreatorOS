# CutStudio private finished-frame export

Status: implementation under qualification; not a full Remotion parity claim.

The runtime status also corrects an earlier false implication: an optional
sandbox URL does not make executable TSX functional. The API now reports
`not_implemented`, and the code-package UI explicitly retains implementation
and qualification as internal work, rather than describing it as only an
external provider gate.

## User workflow

A completed CutStudio video now offers a native frame-export panel. Select the
render, a zero-based frame number and PNG, JPEG or WebP. The download is produced
from that immutable finished artifact, preserving its actual dimensions and
timing. It does not start another video render or publish a private asset.

`GET /api/cut/jobs/:id/still?frame=30&format=png` returns an image attachment
with source-asset, selected-frame and frame-count headers. PNG provides
lossless pixels from the encoded video; this does not recover quality already
lost when that video was encoded. JPEG and WebP use the image encoder defaults.

## Guardrails

- Only completed render jobs and their ready private owner/business-matched
  MP4 artifact are eligible. Active project reviewers and editors can read;
  unrelated or revoked users cannot. Access and asset state are rechecked after
  decoding, before delivering pixels.
- Input validation rejects URLs, arbitrary options, unsupported formats,
  fractions and invalid/out-of-range frames. Actual constant-rate video
  metadata supplies timing; it is not guessed from the current editor state.
- Interactive requests are bounded to 250 MB inputs and 4K pixel count,
  12 requests/account/minute, two concurrent decoders/process, one decoder
  thread, bounded subprocess output and 45-second subprocess deadlines.
- Disconnect cancels decoding. Private temporary files are cleaned after
  completion, rejection and failure. Responses are no-store and nosniff.
- The per-account limiter is process-local, as is the concurrency cap. A
  distributed admission policy is a separate scaling requirement.

## Verification

The dedicated mobile/desktop journey renders a two-color fixture, exports all
three formats, checks decoded dimensions, compares PNG pixels to an independent
exact-frame decode, checks both sides of a cut, downloads through the visible
UI, and exercises unrelated-user denial plus collaborator revocation. Unit
tests cover parameter validation, metadata rejection, exact seek arguments and
idempotent admission-slot release.

Protected CI, deployment and a live private-artifact field test are separate
qualification gates.

Full protected qualification exposed an existing shared-IP render-budget bug:
an editor's authorization probes and render requests exhausted the owner's
five-request limit. The composition batch limiter now keys the same unchanged
ceiling to the authenticated account. The owner/editor/revocation journey
exercises both accounts on one network; no qualification bypass was added.

Local evidence: 134 test files / 550 unit tests and TypeScript pass. Both mobile
and desktop frame-export journeys pass (2/2), including actual encoded-video
pixels and normal-user downloads. The generated Worker declaration now checks
out with LF on Windows as well as CI, matching Wrangler's exact-file check.

## Parity boundary

Remotion documents direct single-frame composition rendering and multiple
image formats in [renderStill](https://www.remotion.dev/docs/renderer/render-still).
This increment closes **finished-video frame extraction**, not direct
composition-to-still rendering, transparent motion-graphic output, PDF export,
image sequences, arbitrary React execution or distributed rendering. Those
must not be marked complete by this feature.
