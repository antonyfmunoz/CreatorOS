# CutStudio versus Remotion: evidence-separated closure register

Updated 2026-09-02. This register supersedes any older suggestion that only
providers or competitive benchmarking remain. Implemented source, isolated
qualification, released application behavior and competitive parity are distinct.

## Current boundary

The last confirmed public source at this checkpoint is
`9f2bc4031fda227b6cc6709f16f1da717b0bbfad`, with verified release identity and
120/120 migration parity. Protected deployment `33687454331` passed. Its native
GCP worker was updated to immutable image
`sha256:e1fc3d0dc0d0b87a2b68b0d781cb0062e485033aa652968447e4cae22909a231`,
with the non-image job configuration unchanged. A new actual job/artifact on
that worker is still pending: signed-in field testing found the revert-before-
autosave bug before a render could be submitted. Earlier actual private
typography/gain-snapshot artifacts belong to `7785912`, not this worker release.

PR 162's opt-in device draft recovery and PR 163's autosave revert correction
are merged. Exact-source deployment `33694995263` for
`824485a33efeb2edffc5d73c8a7c768aa4490f0e` is **in progress**, not yet a live
or field-tested claim. Normal-user private rendering and submitted-snapshot
custody must be repeated after that release is confirmed.

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
| Media | Private MP4/WebM retime/repeat, images/fonts and alpha; candidate timestamp-indexed VFR/B-frame/VP9-alpha decoding and synchronized source sound with focused actual outputs | Complete latest exact-image protected qualification, broader decoder matrix, long media and public source-code execution |
| Audio | Explicit private tracks, stream selection, trim/speed/gain envelopes, AAC/Opus mixing; WAV/MP3/M4A-only prototype exports; frame-authored audio with actual PCM/AAC/Opus lifecycle/range tests; candidate automatic imported-video audio | Exact-candidate protected qualification; browser preview sound, reverse audio, broader interval/workload limits and public code execution |
| Encoding | H.264 MP4, alpha VP9 WebM, PNG/JPEG/WebP stills, image sequences, frame ranges and receipts; qualified prototype GIF and ProRes HQ/4444/XQ with PCM audio; decoded CRF/target-bitrate/speed-control tests; candidate lossless RGB MP4 with full-HD text/transition paint-history regressions and eight independently compared study frames | Exact-candidate protected qualification; additional codecs/containers, two-pass/hardware encoding, HDR, external-editor interoperability and long-range/chunk workflows; production exposure of executable exports |
| Workload limits | Single-job CPU/memory/bytes/frame bounds, timeout, cancellation, cleanup | App/runtime quota reconciliation, durable tenant admission, metering, scheduling, dispatch, recovery and scaled rendering |
| Security | Actual non-root, no-network, read-only, sandboxed browser tests; lean Noble image passed independent CI pixels and zero HIGH/CRITICAL scan in run 33614621889 | Continued exact-image vulnerability qualification, approved execution topology, privilege/credential separation, adversarial review and service deployment |
| Asset custody | Private native asset lineage and prototype request/source/output hashes | Production source/lockfile exchange, short-lived artifact custody, revocation, deletion and recovery for executable jobs |
| Product reliability | Protected snapshot/autosave/mixer, draft/conflict/mobile tests; merged opt-in account-scoped device EDL recovery and reverted-edit saving correction | Latest exact-source deployment and normal-user field repeats, broader multi-user races, full composition preview, offline media/backup and broad edit/render regressions |
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
7. Google management reauthentication has been recovered. Native worker
   promotion still requires the exact protected source, image and production
   receipts. The separate executable-code service still requires approved
   topology; access to the ordinary worker does not authorize sharing its
   credentials or privilege boundary with user code.

## September 2 protected-source checkpoint

- PR 148's frame-authored private audio passed runtime and application gates.
  PR 149's draft/conflict/navigation work is also merged. These are not public
  executable-code or offline-draft claims.
- PR 150's lossless RGB and stable frame-paint candidate passed runtime run
  `33637334537` (63 qualification records, exact-image zero HIGH/CRITICAL findings).
  Its application run had one native-render timeout that passed on retry; the
  original cause remains open. Lossless output is not all-player compatibility.
- PR 151's clean-room text measurement/fitting passed runtime `33640536948`
  (66 records, exact-image zero HIGH/CRITICAL findings) and 282 browser tests,
  with 24 existing skips. It is still part of the isolated prototype, not a
  production source-code editor or user-facing render service.
- PR 152's native resource buffering/retry and numeric encoder progress passed
  protected Verify `33643528748`: 603 root tests, 300 browser passes and 24 existing
  skips, no reported retries. Main is `831ab2f0b3186a94ae85c4baad9f722d39791af1`.
- PR 154's private mask/preview-origin correction passed protected Verify
  `33647407018`: 607 root tests and 304 browser passes with 24 existing desktop
  skips, no reported retries. CodeQL `33647406926` passed. It merged to main
  `50855c0e2721c5d59c1ac02804e400770b0c8b34`. Deployment is still pending.
  See the corresponding [mask receipt](../releases/2026-09-02-cut-private-mask-parity.md).

These newer receipts supersede the table's older candidate-pending descriptions
only for the exact tested scope. Public source, service topology, long-media and
decoder coverage, transformed composition matching, reliable scaled admission,
normal-user field tests and direct competitor comparisons remain open.

## September 2 native motion and color checkpoint

- PR 155 passed protected Verify `33666683909` and CodeQL `33666683932`, including
  324 browser passes, 24 existing desktop skips and no reported retries. It merged
  at `d0ecb189649ff6ece5e7469da8b1ee2daf411c0b`. Scope includes private image/vector
  framing, 2D pivots, exact declarative scalar curves, raster EOF, compatible
  filter-file commands, archive integrity and query-parser hardening.
- PR 156 passed Verify `33668906342` and CodeQL `33668906319`: 328 browser passes,
  24 existing desktop skips and no reported retries. It merged at
  `5d023f40dd3df13b237278e2b544ef7b3ef4d976`. Base sRGB brightness/saturation and
  alpha-preserving constant-color optimization are qualified at source level.
- PR 159's color-effect-order and bounded-decoder candidate passed protected
  Verify `33676259215` and CodeQL `33676259244`, including 332 browser passes,
  24 existing desktop skips and no reported retries. It merged at
  `ebf4d7ef24832d7454761d1874806c83f083ca1b`. Its original failed evidence is retained.
- A fresh public readiness read still identifies source `7785912c74404b653ed64faba1ebe45b7b5a4fb8`,
  build `20260902T102159Z-791e2941c783`, and 120/120 migration parity. New source
  merges are not deployments. Google management access was subsequently restored.

## Native reliability and isolated source-sound candidates

- Native cancellation/lease ownership now stops actual registered child work,
  including the previously missed preparation-before-spawn interval. Bounded
  codec/filter scheduling retains existing image/audio quality settings. At
  source `89fdd2cf3286d653f3f6e28e8b4c8e14273f8552`, 681 root tests, actual SQL
  cancellation/reassignment/expiry tests and 18 local native/browser tests passed.
  Protected Verify `33683362812` passed overall but contained a desktop rolling-
  edit retry (expected 1.8, observed 1.7). That retry is not a clean parity receipt.
  A current-draft saved-indicator fix is being qualified separately in PR 160.
- Isolated imported-video sound passed eight local actual-output records in
  `video-source-audio-20260902212858539/receipt.json`. It covers source clock,
  Sequence/Repeat/Freeze lifecycle, gain/mute, pitch-preserving speed, range
  exports, explicit-track mixing and silent/legacy behavior. Extended tail and
  stream-selection tests, the complete exact-image suite, vulnerability scan
  and protected runtime reproduction are still pending. The fixed eight-interval,
  eight-import and forward-sound limits remain explicit.
- Neither candidate is deployed. Public code execution, normal-user field
  proof and same-input authorized Remotion benchmarks remain open.

## Later September 2 checkpoint: native recovery and exact media

- PR 160 passed protected Verify `33685805817` and CodeQL `33685805872`:
  681 root tests, 346 browser passes, 24 existing desktop skips and no retries.
  Native admission, lease/cancellation ownership and submitted-snapshot source
  are merged and deployed at `9f2bc403`; new-worker private artifact proof remains.
- PR 162 passed Verify `33689899779` and CodeQL `33689899776`: 689 root tests,
  356 browser passes, 24 existing desktop skips and no retries. Device recovery
  is off by default and limited to account-scoped EDL/settings, ten copies,
  256 KiB/copy and seven-day expiry on access. It is not encrypted storage or
  offline media, and restore still needs authentication and revision checks.
- Signed-in production testing found that reverting an edit before the debounce
  left `Saving…` stuck and rendering disabled. PR 163 retained red tests and
  passed Verify `33693691325` / CodeQL `33693691262`: 689 root tests, 360 browser
  passes, 24 existing desktop skips, no retries. It also covers reverting while
  a prior committed PUT response is held. Both this fix and PR 162 are included
  in the pending `824485a` deployment described above.
- PR 161's older automatic source-audio candidate passed protected runtime
  `33689973303` (77 records/image, zero HIGH/CRITICAL findings). Its application
  check contained one audio-startup retry. Later focused tests exposed stale
  browser video frames and nonzero timestamp errors. The newer indexed decoder
  has actual VFR, B-frame, transparency and relative-clock evidence, but its
  full local run failed Docker's control-command deadline. Exact new-head
  protected qualification remains open. See the
  [indexed-media checkpoint](../releases/2026-09-02-cut-code-indexed-media.md).

These entries supersede older dated candidate/deployment statements only within
their explicit scope. Public code service/editor/player, broader motion/media/3D,
safe scaled dispatch, real-device/operator testing and current competitor
benchmarks remain implementation and qualification work, not just providers.

## Completion rule (unchanged)

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
