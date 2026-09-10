# Native export audio targets and 25/50 FPS authoring

Candidate only; not deployed or a parity-completion claim.

CutStudio's conventional render controls now let users choose an AAC target
independently of video quality: 96, 128, 160, 192, 256 or 320 kbps. Omitting the
option preserves the existing draft/social/master targets (128/192/256). Both
single-source and multitrack render paths use one validated encoder settings
function. Job output records the **target**, not a fabricated measured bitrate.
The existing supported 25 and 50 FPS choices are now exposed in the normal UI.

New browser qualification submits both paths through normal controls, rejects an
invalid API target, downloads the actual private exports, checks H.264/AAC and
exact 50/100 frame counts, and compares observed audio bitrates. A higher target
is not claimed to prove perceptual superiority; this checks that the control is
real. Unit tests retain profile defaults and reject unsupported/injected values.
All local/protected qualification and exact worker-image/output proof are pending.

The workflow gap is informed by Remotion's documented separate audio bitrate and
encoding controls: [renderMedia](https://www.remotion.dev/docs/renderer/render-media)
(checked 2026-09-03). No competitor implementation was copied. Codec/container
choice, HDR, broader media, execution isolation and comparative quality remain
separate work. Native deployment currently needs the existing GCP login restored.
