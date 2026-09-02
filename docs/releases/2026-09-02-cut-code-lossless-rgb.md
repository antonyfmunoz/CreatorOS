# CutStudio lossless RGB and frame paint custody

## Scope

The separate, credential-free code-runtime prototype adds
`videoEncoding: { losslessRgb: true, preset: "fast" }`: H.264 RGB MP4 with
CRF zero, full-range RGB and no chroma subsampling. Conflicting CRF, bitrate,
VP9 or non-MP4 settings fail validation. Ordinary browser-playable MP4 defaults
and existing frame/pixel/time/memory/output limits are unchanged.

This is an opaque 8-bit editing master, not alpha, HDR, lossless soundtrack,
recovery of previously compressed source detail or guaranteed external-editor
compatibility. Public executable jobs remain `not_implemented`; no application
credentials, additional provider or production isolation approval is introduced.

## Regressions found, not waived

The first small noise/stripe fixture passed exact decoded RGB comparisons, but
the larger native-authored motion study did not. At frame 14, two color-channel
samples differed between sequential video and an independently painted still.
Grayscale text capture corrected that case but left 349 differing channel
samples at frame 59's layered rounded transition, also reproduced in a PNG
sequence. It was browser paint-history behavior, not loss from the RGB encoder.

The candidate uses grayscale text and invalidates retained stage layout/paint
before each settled capture without remounting authored React or prepared media.
The dedicated full-HD regression renders independent stills, PNG ranges and
RGB video ranges at frames 14 and 59. Both comparisons require exactly zero
differing samples; no tolerance, sandbox relaxation or timeout increase was used.

## Actual local artifacts

Normal local image:
`sha256:43ea9f4d805152f4d616c9268a18afe48e066dcfb315c7e51b98db82bf259b97`.

The own-source motion study produced a silent 1080x1920, 30 fps, 180-frame,
six-second H.264 `gbrp`/full-range RGB master in 67,134 ms under the existing
isolated job constraints. Output size is 17,191,530 bytes; SHA-256:
`c2efaec59da6ce261b6df86aaefb276624c93952ff725864168f8dfe4fb0aa18`.
Frames 0, 14, 30, 59, 90, 119, 150 and 179 each exactly match an independently
rendered PNG: 49,766,400 compared RGB samples, zero differences. This is eight
sampled frames, not independent all-180-frame qualification or a competitor run.

Retained local study evidence:
`B:/CreativesOS-task-artifacts/cut-motion-workload/lossless-repaint-output/receipt.json`.
Earlier failing study artifacts remain retained in distinct directories.

The protected suite additionally checks every pixel in a six-frame saturated
noise/one-pixel-stripe composition, a nonzero range, actual AAC soundtrack energy,
exact video replay, and the full-HD paint-history regressions. The complete local
artifact/isolation suite passed with 63 evidence records at
`2026-09-02T13:28:55.608Z`; all 51 runtime unit tests passed. Those records are not
63 separately counted tests. Fresh independent candidate/vulnerability
qualification is still pending; earlier image receipts do not qualify this image.

## Remaining gates

The same candidate includes [private preview recovery and on-demand font
loading](2026-09-02-cut-preview-recovery.md). The combined application source
passed `npm run verify` with 595 tests and 18 focused desktop/mobile journeys.
The previously merged draft-custody work is already an ancestor; this candidate
is based on main `970dec3d6d873e1d5503dcea5fbe93c9e90a9568`.

Protected application/browser/runtime checks, exact candidate vulnerability scan,
merge, approved separate execution topology, production dispatcher/custody and
user-facing player/export behavior remain distinct. Public production was not
changed by these isolated runs. Neither successful RGB encoding nor the study
establishes general Remotion parity, long-media scale, HDR or external-player
support. See the evidence-separated closure register.
