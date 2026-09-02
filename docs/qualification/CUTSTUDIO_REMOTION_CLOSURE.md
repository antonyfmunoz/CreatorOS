# CutStudio versus Remotion: evidence-separated closure register

Updated 2026-09-02. This register supersedes any older suggestion that only
providers or competitive benchmarking remain. Implemented source, isolated
qualification, released application behavior and competitive parity are distinct.

## Current boundary

The public application remains on source
`7785912c74404b653ed64faba1ebe45b7b5a4fb8` at this checkpoint. Its private native
rendering path has actual GCP/R2 artifact evidence, including private fonts,
automatic two-line text fitting and preservation of submitted gain while the
project changes. The snapshot receipt records the release, output hash and
decoded audio/frame. Its exact Cloud Run execution/image receipt is still pending
Google management reauthentication; verified job configuration is not execution
proof. Later merged candidates require their own protected release and production
receipts before public capability claims advance.

The separate `runtimes/cut-code` implementation is a local/protected-CI prototype,
not a public executable-capsule service. A saved code package is not an executable
feature. The application correctly reports `isolatedCode: not_implemented`.

## Capability and remaining work

| Area | Evidence available | Still required for direct substitution |
| --- | --- | --- |
| Native declarative compositions | Owned manifests, parameter batches, private rendering, typography/fitting production artifacts | Larger representative content, editing ergonomics and quality/time comparisons |
| React/TSX source | Pinned React, relative modules, typed clean-room SDK, structured private CSS, fonts/images; bounded explicit frame holds/cancellation with actual async pixels and replay tests | Public editor/player/render path; broader approved dependencies; safe user-facing error reporting and preview buffering |
| Motion | Local/global frames, nested sequence/repeat/freeze, interpolation, Bezier, springs, fitted timing, color, reproducible variation | Representative complex compositions and exact preview/export agreement |
| 3D | Pinned Three core with SVGRenderer, decoded camera/geometry/depth/motion tests | WebGL/WebGPU, textures/shaders/lighting and actual production GPU qualification |
| Media | Private MP4/WebM frame seek/retime/repeat, image/font resources and alpha-overlay reuse | VFR and broad decoder matrix, long media, edge cases and lifecycle-synchronized source sound |
| Audio | Explicit private tracks, stream selection, trim/speed/gain envelopes, AAC/Opus mixing; WAV/MP3/M4A-only prototype exports; candidate frame-authored audio with actual PCM/AAC/Opus lifecycle/range tests | Exact-candidate protected qualification; browser preview sound, automatic video-source sound, reverse audio, broader interval/workload limits and public code execution |
| Encoding | H.264 MP4, alpha VP9 WebM, PNG/JPEG/WebP stills, image sequences, frame ranges and receipts; qualified prototype GIF and ProRes HQ/4444/XQ with PCM audio; decoded CRF/target-bitrate/speed-control tests | Additional codecs/containers, lossless RGB, two-pass/hardware encoding, HDR, external-editor interoperability and long-range/chunk workflows; production exposure of executable exports |
| Workload limits | Single-job CPU/memory/bytes/frame bounds, timeout, cancellation, cleanup | App/runtime quota reconciliation, durable tenant admission, metering, scheduling, dispatch, recovery and scaled rendering |
| Security | Actual non-root, no-network, read-only, sandboxed browser tests; lean Noble image passed independent CI pixels and zero HIGH/CRITICAL scan in run 33614621889 | Continued exact-image vulnerability qualification, approved execution topology, privilege/credential separation, adversarial review and service deployment |
| Asset custody | Private native asset lineage and prototype request/source/output hashes | Production source/lockfile exchange, short-lived artifact custody, revocation, deletion and recovery for executable jobs |
| Product reliability | Snapshot rendering/review and autosave/mixer tests; primary gap/tail and unsaved-draft/background-refresh local browser receipts | Exact-source merge/deploy, normal-user field repeats, multi-user races, general timeline preview, crash/offline draft recovery and broad edit/render regressions |
| Competitive verdict | Locked benchmark rules; current official feature references | Same inputs/settings, authorized current competitor run, retained artifacts/actions/costs, human quality review; no blanket parity claim |

## Release blockers versus implementation

1. Structured CSS data transfer fixed the stylesheet generated-code finding;
   CodeQL and the full protected suite passed before PR 141 merged. Exact
   production release qualification remains distinct from those source checks.
2. The older Trixie image remains blocked. The lean Noble candidate removed
   unused vulnerable components and passed the full local artifact suite plus
   a fresh zero HIGH/CRITICAL scan. Protected candidate CI run 33614621889 also
   passed before PR 142 merged. Approved isolation topology and actual public
   service qualification remain required. Every new image requires fresh proof. No ignore
   list or lowered gate is authorized.
3. The ordinary GCP worker holds application/provider credentials. It must never
   become the executable-capsule worker by simply importing the prototype.
4. Existing public capsule CPU/memory/output declarations do not yet match the
   prototype's fixed enforced limits. A dispatcher must reject unsupported
   requests explicitly rather than silently promise or ignore those limits.
5. Submitted native timeline snapshots now have an actual private production
   output test. Primary gaps/tails and draft-navigation/background-refresh guards
   passed protected PR 143 checks and merged; exact-source deployment and field
   qualification remain. PR 145's primary timing preview is scoped to primary
   clips, not all graphics, tracks, effects or final-frame composition.
6. WebM container replay initially failed despite equal decoded pixels. The
   reproducible-metadata fix passed all local isolated/candidate tests and a
   zero HIGH/CRITICAL scan. Runtime CI 33621171596 independently reproduced both
   suites and the scan; application/browser/release gates remain separate.
7. Google management reauthentication is required for the pending execution
   receipt and subsequent worker promotion. This is a credential gate, not
   evidence that all remaining implementation is external.

## Completion rule

A row closes only with source and test links, exact release identity where
applicable, retained actual outputs, and explicit scope/limits. A passing test
does not prove untested codecs, mobile devices, scale, privacy boundaries or
competitive superiority. The integration advantage is measured only after
standalone quality meets the agreed comparison bar.

Sources: [Remotion encoding](https://www.remotion.dev/docs/encoding),
[existing programmable-cinema standard](../CUT_STUDIO_PROGRAMMABLE_CINEMA_STANDARD.md),
[locked creation benchmark](CREATION_STUDIOS_GOLDEN_BENCHMARK.md),
[private typography production receipt](../releases/2026-09-02-cutstudio-fitting-production.md),
[submitted snapshot production receipt](../releases/2026-09-02-cutstudio-snapshot-production.md),
[WebM replay receipt](../releases/2026-09-02-cut-code-webm-replay.md).
