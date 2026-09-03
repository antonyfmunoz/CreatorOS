# CutStudio versus Remotion: evidence-separated closure register

Updated 2026-09-03. This register supersedes any older suggestion that only
providers or competitive benchmarking remain. Implemented source, isolated
qualification, released application behavior and competitive parity are distinct.

## Current boundary

Latest checkpoint after PR 173 deployment: exact public source
`efed8e7ada67a0ffb4cf26be3e8e745faad6b7ab` is verified at `/api/release` and
`/api/ready`, with 120/120 migrations and no readiness blockers. Protected
deployment `33725833600` passed 787 root tests, 382 browser checks, 24 existing
desktop skips and two public identity checks, with no reported retries.
The image/actual-output receipt below still proves the earlier PR 171 app with
the PR 173 native worker; it is not a new field receipt for this public source.

PR 174 merged native subprocess credential/diagnostic/input-protocol hardening
at `f6fb3ce8fd500975959d15fcbf190c30d931001f` after protected Verify `33727615495`
passed 794 root and 382 browser checks without reported retries. Its local broad
native/browser run passed **27/28**: the same 45-second native-session deadline
failed and remains open. Its image is built, not promoted. A separate capture
experiment preserved all pixels only with a slower implementation, so it was
rejected rather than shipped as a performance fix.

PR 175's first sticky-file-bar candidate failed the mobile file-switch check
twice. Corrected `f84850a` passed 794 local root tests, types/build/bundle and all
18 local source-editing checks. Verify `33731495043` passed 794 root tests,
384 browser checks and 24 existing skips without reported retries; CodeQL passed.
It merged at `3f6676c1218a9c8cdfe41ced71c381087d8872b3`. Deployment and normal-user
field proof are pending. The
native demuxer/ingest candidate adds real local-manifest rejection and supported
format controls; see the [input-container boundary](../releases/2026-09-03-native-media-demuxer-boundary.md).
It is not yet a qualified deployment. Public TSX execution, full composition
preview, broader media/3D, scaled admission, cold-worker latency and authorized
same-input competitor comparisons still prevent a parity claim.

### Earlier checkpoint, superseded only by the exact evidence above

Checkpoint 2026-09-03 07:19 UTC: PR 171's exact public deployment
`33721447399` passed (764 root, 382 browser journeys, 24 existing desktop skips,
no reported retries and two public identity checks). Current confirmed public
source is `12642a1d1a0b9b929758f190628de007f475352a`, 120/120 migrations.
PR 173 merged at `efed8e7ada67a0ffb4cf26be3e8e745faad6b7ab` after protected
787-root/382-browser qualification; its application deployment `33725833600`
is still running. Its frozen local run passed root/types/build/bundle and real
native lifecycle/animation checks, but passed **15/16** selected browser cases:
one desktop native-session case exceeded 45 seconds. That failure is retained.

The PR 173 native image is independently production-tested with the PR 171 app:
private text/Lottie/Rive output, saved source offset, exact decoded geometry,
anonymous denial and original-project invariants all pass. The exact image is
`sha256:e508f0fd89ac61ab341b4824e4aa509985fd4643bd7ec550eda0c1f84a33ecc9`.
Completion was 178,706 ms, barely inside the unchanged 180-second gate. Earlier
252,650/254,280 ms failures remain failed. The new clock measures about two
seconds Node uptime at worker-start versus about 164 seconds since submission;
pre-process delay dominates this observation, but a specific platform root cause
and reliable latency are not established.

The next candidate closes native FFmpeg input-protocol and private-error/
environment boundaries. Its 23 focused tests pass; full qualification/deployment
are pending. [Detailed scope and evidence](../releases/2026-09-03-cut-native-io-boundary.md).
Filesystem isolation, aggregate scratch/fleet budgets, native deadline stability,
public executable TSX service, broader motion/3D/media and authorized comparative
benchmarks still remain. **Only providers remain is not an accurate status.**

### Prior checkpoint (retained historical evidence)

Checkpoint 2026-09-03 06:39 UTC: production deployment `33718462648` passed for
`f3648cbc6d1fb3152648acfb093bbafbef021544`: 760 root tests, 378 mobile/desktop
journeys, 24 existing desktop skips, no reported retries and two public-release
checks. The public release endpoint confirms this exact clean source with
120/120 migration parity. A fresh approved-owner field run passed source editing,
immutable source/lockfile saves and reopen, undo/redo and the expanded workspace
on both sizes. The qualification session ended. Source editing remains data-only.

A separate private production render produced independently decoded H.264,
three wrapped text lines, visible Lottie/Rive and changed animation frames on
execution `creativesos-cut-worker-kbcfz`. Management evidence confirmed immutable
image `sha256:1c0117030049ea6428035416e2451e4264a8a62c4a7343692e09ac07ae324ad4`.
Private access and original-project invariants passed. However, completion took
252,650 ms: **the original 180-second performance gate failed and remains failed**.
Most delay preceded the worker-start event; platform versus module-bootstrap
causation is not established. The [startup clock candidate](../releases/2026-09-03-cut-worker-startup-clock.md)
adds measurement, not a claimed latency fix.

PR 171 is merged at `12642a1d1a0b9b929758f190628de007f475352a`. It fixes Lottie
asset-rate/in-point handling, preserves animation source offsets in export and
adds the normal layer offset control. Its final candidate `65bd39b` passed
Verify `33720057933`: 764 root and 382 browser checks, 24 existing skips, no
reported retries. Exact decoded-frame comparisons and actual private authoring/
reload/preview/export geometry passed. The first oracle failure remains retained:
the test had read the preview's initial frame 6 instead of explicitly restarting
at frame 0. The correction keeps the same pixel tolerance.

Deployment `33721447399` for PR 171 is still running at this checkpoint. Its
native worker image is already promoted to
`sha256:5e46e1a055901d0a61db270213606a3da77d96039a5885a4829e672c74ba4bf4`.
Build source `2c9b0c5d6b58a46f2350bb7e39821b642104a8e6` has identical native
inputs to the merged release; only tests/docs changed afterward. Before/after
receipts confirm the same non-image policy hash, 2 CPU, 4 GiB and one task. A new
exact-image production timing/offset field result remains required. Promotion
alone is not proof of output. See [animation timing](../releases/2026-09-03-cut-animation-timing.md).

PR 172 is merged at `7f4bf45dffbf7b87e511e66868cbecd181b8953a`. Its pinned
Windows headless runtime candidate `a4b7019` passed Verify
`33721603073`: 770 root tests, 203 mobile plus 179 desktop checks, 24 existing
skips and no reported retries. CodeQL passed. The frozen local default-path run
passed root/types/build/bundle, real owned-process shutdown, actual Lottie/Rive
and all 16 selected mobile/desktop authoring/export checks in 13.4 minutes.
Earlier installed-browser and full-browser deadline failures remain retained.
See [Windows browser selection](../releases/2026-09-03-cut-pinned-windows-browser.md).

The next native-input candidate bounds concurrent preparation, drains active
writes before failure cleanup, forwards cancellation through private R2 streaming
and media inspection, and bounds probe lifetime/output. Its 30 focused tests
pass, including actual stream/process cleanup and rotation/audio geometry. Full
qualification and release are pending. See [input preparation](../releases/2026-09-03-cut-input-preparation.md).

Public executable TSX still reports `not_implemented`. The dedicated execution
service requires approved isolation/cost topology. Broader motion/media/3D,
scaled admission, realistic workloads and authorized current Remotion comparisons
remain open. Neither the native release nor the timing candidate proves parity.

### Earlier dated evidence (not the current deployment state)

The last confirmed public source at this checkpoint is
`824485a33efeb2edffc5d73c8a7c768aa4490f0e`, with verified release identity,
120/120 migration parity and `release_ready` with no blockers. Protected
deployment `33694995263` passed, but its full browser run had one retained
recovery retry. The native GCP worker remains on immutable image
`sha256:e1fc3d0dc0d0b87a2b68b0d781cb0062e485033aa652968447e4cae22909a231`,
with the non-image job configuration unchanged. Actual private job
`8c6dddc8-da6a-4360-a6ea-a6da73af1f68` completed on this image. Independently
decoded output is H.264 406x720, 90 frames/3 seconds with AAC; measured source
gain ratio .24976266 preserves the submitted .25 snapshot despite the later .5
draft. Anonymous access was denied. The original three-minute wait failed due
to pre-worker startup latency and remains failed; the same job was inspected
after completion, not replaced with an easier job. See the
[production receipt](../releases/2026-09-03-cut-native-worker-and-save-production.md).

PRs 162/163 are deployed in that release. PR 164's current-draft recovery-write
status and exact two-tab persistence test passed updated Verify `33700632584`
(689 root, 193 mobile + 169 desktop, 24 existing skips, no retries) and CodeQL
`33700632573`. It merged at `dec2f55a0f63a4735aff488220240446d42d56fa`; this
new recovery correction is not yet a deployment or normal-user field claim.

PR 161 is merged with exact indexed VFR/B-frame/VP9-alpha/source-audio proof:
runtime `33698281193` passed 83 records/image with zero candidate HIGH/CRITICAL
findings; Verify `33698281064` passed 360 browser checks without retries.
PR 165 extends this to fractional source-sound loops: latest source `1f5d4c7`
passed 86 records/image and zero HIGH/CRITICAL findings in `33702482401`;
Verify `33702482406` passed 689 root tests and 362 browser journeys without
retries (24 existing desktop skips), and CodeQL `33702482404` passed. It merged
at `c76509584a6b7a3b06c338e85e0535cb8cc8d079`. Exact candidate image:
`sha256:9b16b83746efe0aed37afeb3f35344a940e81a67f4a5a4c07a805d745e6e8e0c`.
This is still not a public executable-code service. See the
[fractional-sound receipt](../releases/2026-09-03-cut-fractional-source-sound.md).

PR 166 implements a bounded data-only source-package editor: text editing,
private immutable ZIP saves and authenticated reopen. Final source `14033e7`
passed every protected Verify/CodeQL job and merged at
`4af98a7b316f77e8b5488dbf9e363439529b6a9d`. Earlier `e22d434` passed 703 root
tests and 366 browser journeys without retries (24 existing skips); final run
`33703887438` needs its detailed count/retry receipt retrieved separately.
The final local run passed 704 root tests, types/build and worker checks but
failed the unchanged 120-second browser-server startup gate before any journey.
Original local failures remain retained. This is not yet a deployed-editor or
public executable-player claim. See the
[source-authoring receipt](../releases/2026-09-03-cut-source-authoring.md).

The next candidate adds generated pinned source/lockfile pairs, honest partial
failure handling, stale-pair protection, server dependency reconciliation and
bounded source undo/redo. The first pairing head failed its multipart test
oracle on both viewport sizes; protected core/native/database and CodeQL passed.
Local render-deadline failures are retained separately. The corrected oracle
downloads actual saved private bytes and verifies peer-account denial. All 48
focused source/history tests and all four earlier real-installer cases passed;
full combined-source browser/protected/production qualification is pending.
See the [pairing receipt](../releases/2026-09-03-cut-source-lockfile-pairs.md)
and [history scope](../releases/2026-09-03-cut-source-history.md).

The separate `runtimes/cut-code` implementation is a local/protected-CI prototype,
not a public executable-capsule service. A saved code package is not an executable
feature. The application correctly reports `isolatedCode: not_implemented`.

## Capability and remaining work

| Area | Evidence available | Still required for direct substitution |
| --- | --- | --- |
| Native declarative compositions | Owned manifests, parameter batches, private rendering, typography/fitting production artifacts | Larger representative content, editing ergonomics and quality/time comparisons |
| React/TSX source | Pinned React, relative modules, typed clean-room SDK, structured private CSS, fonts/images; bounded frame holds/cancellation with actual prototype pixels/replay; released data-only source/lockfile editor and expanded workspace with approved-owner field proof | Public executable player/render path; broader approved dependencies; safe diagnostics and buffering |
| Motion | Local/global frames, nested sequence/repeat/freeze, interpolation, Bezier, springs, fitted timing, color, reproducible variation | Representative complex compositions and exact preview/export agreement |
| 3D | Pinned Three core with SVGRenderer, decoded camera/geometry/depth/motion tests | WebGL/WebGPU, textures/shaders/lighting and actual production GPU qualification |
| Media | Private MP4/WebM retime/repeat, images/fonts and alpha; protected timestamp-indexed VFR/B-frame/VP9-alpha decoding and synchronized source sound | Keep exact-image gates green after changes; broader decoder matrix, long media and public source-code execution |
| Audio | Explicit private tracks, stream selection, trim/speed/gain envelopes, AAC/Opus mixing; WAV/MP3/M4A-only prototype exports; frame-authored audio and fractional imported-video sound with actual PCM/range/replay proof | Browser code-preview sound, reverse audio, broader interval/workload limits and public code execution |
| Encoding | H.264 MP4, alpha VP9 WebM, PNG/JPEG/WebP stills, image sequences, frame ranges and receipts; qualified prototype GIF and ProRes HQ/4444/XQ with PCM audio; decoded CRF/target-bitrate/speed-control tests; candidate lossless RGB MP4 with full-HD text/transition paint-history regressions and eight independently compared study frames | Exact-candidate protected qualification; additional codecs/containers, two-pass/hardware encoding, HDR, external-editor interoperability and long-range/chunk workflows; production exposure of executable exports |
| Workload limits | Single-job CPU/memory/bytes/frame bounds, timeout, cancellation, cleanup | App/runtime quota reconciliation, durable tenant admission, metering, scheduling, dispatch, recovery and scaled rendering |
| Security | Actual non-root, no-network, read-only, sandboxed browser tests; lean Noble image passed independent CI pixels and zero HIGH/CRITICAL scan in run 33614621889 | Continued exact-image vulnerability qualification, approved execution topology, privilege/credential separation, adversarial review and service deployment |
| Asset custody | Private native asset lineage and prototype request/source/output hashes | Production source/lockfile exchange, short-lived artifact custody, revocation, deletion and recovery for executable jobs |
| Product reliability | Protected snapshot/autosave/mixer, draft/conflict/mobile tests; deployed device EDL recovery and reverted-edit saving; actual immutable private render; newer recovery status correction merged | Deploy/field-test subsequent fixes; cold-worker latency; broader multi-user races, full composition preview, offline media/backup and broad regressions |
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
