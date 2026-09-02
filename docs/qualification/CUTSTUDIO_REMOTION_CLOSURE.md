# CutStudio versus Remotion: evidence-separated closure register

Updated 2026-09-02. This register supersedes any older suggestion that only
providers or competitive benchmarking remain. Implemented source, isolated
qualification, released application behavior and competitive parity are distinct.

## Current boundary

The public application remains on source
`41e6ca1efe725b87ba43c7b664dc5f17badf5a63` at this checkpoint. Its private native
rendering path has actual GCP/R2 artifact evidence, including private fonts and
automatic two-line text fitting. The dated production receipt records the exact
job, image, output hash and decoded frame. Later candidates require their own
protected release and production receipts before this statement is advanced.

The separate `runtimes/cut-code` implementation is a local/protected-CI prototype,
not a public executable-capsule service. A saved code package is not an executable
feature. The application correctly reports `isolatedCode: not_implemented`.

## Capability and remaining work

| Area | Evidence available | Still required for direct substitution |
| --- | --- | --- |
| Native declarative compositions | Owned manifests, parameter batches, private rendering, typography/fitting production artifacts | Larger representative content, editing ergonomics and quality/time comparisons |
| React/TSX source | Pinned React, relative modules, typed clean-room SDK, structured private CSS, fonts/images | Public editor/player/render path; broader approved dependencies; safe error reporting |
| Motion | Local/global frames, nested sequence/repeat/freeze, interpolation, Bezier, springs, fitted timing, color, reproducible variation | Representative complex compositions and exact preview/export agreement |
| 3D | Pinned Three core with SVGRenderer, decoded camera/geometry/depth/motion tests | WebGL/WebGPU, textures/shaders/lighting and actual production GPU qualification |
| Media | Private MP4/WebM frame seek/retime/repeat, image/font resources and alpha-overlay reuse | VFR and broad decoder matrix, long media, edge cases and lifecycle-synchronized source sound |
| Audio | Explicit private tracks, stream selection, trim/speed/gain envelopes, AAC/Opus mixing; WAV/MP3/M4A-only prototype exports | React audio lifecycle integration, preview mixing, longer representative workloads and public code execution |
| Encoding | H.264 MP4, alpha VP9 WebM, PNG/JPEG/WebP stills, image sequences, frame ranges and receipts; qualified prototype GIF sampling/repetition/transparency | Additional codecs/containers, encoding controls, ProRes/HDR where supported and benchmarked; production exposure of executable exports |
| Workload limits | Single-job CPU/memory/bytes/frame bounds, timeout, cancellation, cleanup | App/runtime quota reconciliation, durable tenant admission, metering, scheduling, dispatch, recovery and scaled rendering |
| Security | Actual non-root, no-network, read-only, sandboxed browser tests | Production image vulnerability gate, approved execution topology, privilege/credential separation, adversarial review and service deployment |
| Asset custody | Private native asset lineage and prototype request/source/output hashes | Production source/lockfile exchange, short-lived artifact custody, revocation, deletion and recovery for executable jobs |
| Product reliability | Snapshot rendering/review candidate and autosave/mixer candidate tests | Exact-source merge/deploy, normal-user field repeats, multi-user races and broad edit/render regressions |
| Competitive verdict | Locked benchmark rules; current official feature references | Same inputs/settings, authorized current competitor run, retained artifacts/actions/costs, human quality review; no blanket parity claim |

## Release blockers versus implementation

1. The stylesheet bundler's generated-code finding must be fixed in source and
   verified by CodeQL, not dismissed merely because another layer escaped HTML.
   Structured CSS data transfer is the candidate correction.
2. The production image candidate is separately blocked by HIGH/CRITICAL
   vulnerabilities. Passing the local Playwright image is not approval to
   expose untrusted customer code. No ignore list or lowered gate is authorized.
3. The ordinary GCP worker holds application/provider credentials. It must never
   become the executable-capsule worker by simply importing the prototype.
4. Existing public capsule CPU/memory/output declarations do not yet match the
   prototype's fixed enforced limits. A dispatcher must reject unsupported
   requests explicitly rather than silently promise or ignore those limits.
5. Current ordinary render work includes immutable submitted timelines and
   revision-safe autosave; these are actual native implementation gaps, not
   external provider activation.

## Completion rule

A row closes only with source and test links, exact release identity where
applicable, retained actual outputs, and explicit scope/limits. A passing test
does not prove untested codecs, mobile devices, scale, privacy boundaries or
competitive superiority. The integration advantage is measured only after
standalone quality meets the agreed comparison bar.

Sources: [Remotion encoding](https://www.remotion.dev/docs/encoding),
[existing programmable-cinema standard](../CUT_STUDIO_PROGRAMMABLE_CINEMA_STANDARD.md),
[locked creation benchmark](CREATION_STUDIOS_GOLDEN_BENCHMARK.md),
[private typography production receipt](../releases/2026-09-02-cutstudio-fitting-production.md).
