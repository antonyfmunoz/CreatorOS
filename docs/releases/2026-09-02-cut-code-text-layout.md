# Native code-authored text layout

The separate CutStudio SDK adds `measureText` and `fitText`, using actual
browser layout rather than guessed character widths. It supports one-line and
bounded wrapped sizing, explicit height/line limits, numeric weight, style,
spacing and direction. The immutable result includes the complete layout style
needed to reproduce the measurement. A private family must already be registered
and loaded; missing fonts fail explicitly, and fitting below the minimum is
reported as `fits: false`. Neither function obtains remote fonts or enables
network access.

This is clean-room native implementation. Remotion's official
[text fitting](https://www.remotion.dev/docs/layout-utils/fit-text) and
[measurement](https://www.remotion.dev/docs/layout-utils/measure-text)
documentation established the comparison capability; its implementation was not
copied or imported. Our options and return contract are not drop-in compatibility.
The existing visual editor's fitting feature is separate and is not being
recounted as newly implemented.

## Evidence checkpoint

All 57 runtime unit/type tests passed. The focused isolated artifact qualification
passed with actual private Noto Sans text, a changed title, explicit line breaks,
wrapped text, direction/spacing, diacritics and markup rendered literally.
The fixture compares the returned measurement against the real styled text DOM,
checks tiny-size line rounding and temporary-node cleanup, requires explicit
missing-font/overflow results, and verifies visible text remains inside its
unclipped boxes. Repeated stills match exactly; both sequential RGB video frames
match independently rendered PNGs exactly.

Local focused image:
`sha256:4d9a6400a3f050907aee576a7457e87589c13af4263ba85868963394589afaf0`.
Focused evidence is retained in
`B:/CreativesOS-task-artifacts/cut-code-text-layout-focused/`.
The complete local isolated regression also passed on that exact image, with
receipt timestamp `2026-09-02T14:05:26.680Z`. This includes the prior encoding,
private assets/audio, async readiness, replay, denied network/files, watchdog
and cancellation tests. Independent protected exact-image qualification and its
fresh security scan remain pending. Prior image security receipts do not cover it.

## Protected closure

PR 151 merged as `83b7e85ea1fd828b7eb9002ccb3ec87de925d85d` after protected
checks passed. Runtime run `33640536948` qualified the exact production-candidate
image `sha256:a12094bfe2785c50004884a910ff8e03b868a1bd2de62e7e773c2b0f8c37ac14`:
66 evidence records at `2026-09-02T14:18:11.131Z`; the scan identifies that same
image and contains zero HIGH/CRITICAL findings. Verify run `33640536966` completed
with 282 browser tests passed, 24 pre-existing skips and no reported flaky tests.
Source merge is not deployment or public executable-code availability.

## Boundaries

Helpers require the composition browser, a bounded plain-text input and one
loaded private family or standard CSS generic. CSS line boxes are measured;
decorative ink overhang, shadows, strokes, transforms, arbitrary inherited style,
full Unicode glyph coverage and editorial quality are separate concerns.
The fixture is not a universal shaping/font test or a same-input Remotion run.
Public code execution, its approved isolated service, user-facing code editor,
dispatch/custody, quota reconciliation and production field evidence remain
open. No public production service or provider account changed in this step.
