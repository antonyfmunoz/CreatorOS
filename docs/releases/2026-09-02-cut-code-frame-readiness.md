# Explicit bounded asynchronous frame preparation

The isolated code-rendering prototype now coordinates authored asynchronous
preparation before taking each frame. This is a clean-room CutStudio API, not
Remotion source/API compatibility or public executable-code deployment.

`holdFrame({ timeoutMs })` creates an opaque preparation handle; all holds must
clear through `releaseFrame(handle)` before capture. `failRender()` permanently
fails the render. Release is idempotent after successful release, supporting
effect cleanup; invalid handles fail explicitly. Caller-provided exception
contents are not exported into shared logs.

Limits: 64 pending handles, default 10-second hold, 1..30,000-ms explicit timeout,
eight browser/media settlement rounds, and the unchanged independent 120-second
host deadline (110-second child deadline). Expiry begins at acquisition, remains
terminal and cannot be renewed by releasing or replacing an expired handle.
The renderer flushes queued React updates and waits for newly introduced private
images/fonts/media, checking readiness again after browser paint. This does not
grant network, host files, workers or credentials to the composition.

## Qualification

On 2026-09-02 all 44 runtime unit/type tests and the complete normal-image and
lean-candidate isolated suites passed. New actual-output tests:

- An owned four-frame sequence changes asynchronously prepared state on every
  frame, with two independently released holds. All decoded frames alternate
  expected green/blue pixels; the initial red placeholder never appears.
- A second render produces the identical whole frame-sequence ZIP.
- Missing release, explicit cancellation and 65 pending holds fail in the render
  phase, not merely by reaching the independent host deadline. No accepted
  artifact is returned. The complete suite retains its actual no-network,
  metadata/file-denial, watchdog, cancellation and container-cleanup checks.
- Unit tests cover every-handle waiting, state flushing, exact acquisition-time
  expiry, permanent failure, pending-capacity reuse and invalid handles/bounds.
  Type tests reject fabricated handles, string timeouts and private diagnostic
  arguments to cancellation.

Logs: `B:/CreativesOS-task-artifacts/frame-readiness-unit.log` and
`frame-readiness-isolated.log`. Synthetic frames and the ZIP are under the
runtime's ignored `qualification-output/` directory. The lean candidate also
passed a fresh Trivy 0.74.0 scan with zero HIGH/CRITICAL findings and no waivers.
Its log and JSON are `frame-readiness-candidate-scan.log` and
`frame-readiness-candidate-vulnerabilities.json` in the retained task directory.
Independent protected CI remains required; no public application release is claimed.

Normal image: `sha256:860cd9c4e60480bbd654d7b2c8a6bee514f187fa87fa3e86c9fb513b3f5e54e2`.
Candidate: `sha256:5903142385d4d8ea34c98f65ffdc344156a45a635369584650d54cede718c893`.
Both images produced the same async sequence SHA-256:
`d89379802e319fe6df92025029b5199afb6b8e23c3a13042c7229c1ffbe24d0d`.

## Authoring and remaining boundaries

Acquire a hold before starting async work; update the component state before
release, and clean up timers/work and the handle when the effect unmounts.
Use frame-keyed layout effects for per-frame work or a stable initializer for
one-time preparation; do not create an unreleased handle on every React render.
Use `failRender()` for unrecoverable preparation failure instead of accepting a
blank image. The API coordinates readiness, not arbitrary timers, network data
fetching, a live preview buffering system or nondeterministic source behavior.

Behavior reference: [Remotion's documented render-delay contract](https://www.remotion.dev/docs/delay-render).
No Remotion source or package was copied; our resource and privacy contract differs.
