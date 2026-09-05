# CutStudio competitive parity rubric

**Status:** canonical acceptance rubric for CutStudio motion graphics and
cinematic-generation comparisons.  
**Companion documents:** [Creation Studios competitive standard](../CREATION_STUDIOS_COMPETITIVE_STANDARD.md), [golden benchmark](CREATION_STUDIOS_GOLDEN_BENCHMARK.md), and [Remotion closure register](CUTSTUDIO_REMOTION_CLOSURE.md).  
**Last revised:** 2026-09-04

## The rule

“100% complete” does **not** mean that a feature inventory happens to total
100 points. It means a target creative can complete the declared normal job in
CreativesOS at equivalent professional quality, control, safety and recovery,
and then receive a measured connected-workflow advantage. A beautiful UI,
local test, prototype render, configured provider, or one exceptional result
does not earn parity by itself.

This rubric evaluates four direct comparison families independently:

1. **Remotion** — programmable, deterministic React video.
2. **HyperFrames** — HTML/browser-authored deterministic motion graphics and
   agent-oriented rendering.
3. **Higgsfield** — controlled cinematic AI generation.
4. **Creator motion suites** — the motion-graphics portion of CapCut,
   Premiere Pro, DaVinci Resolve and After Effects-class workflows that is
   material to the CreativesOS creator-distribution job.

The scope is intentionally not “clone every specialist feature.” A capability
may be marked `intentional_exclusion` only when the owner records why it is not
needed for the declared creator workflow and an alternate safe path exists. It
can never be silently omitted.

## Qualification states

Each row receives one state and an evidence URI. States are ordinal, but they
are **not** a substitute for the hard gates below.

| State | Meaning | Counts toward a 100% claim? |
| --- | --- | --- |
| `0 absent` | No native product behavior. | No |
| `1 designed` | Contract, mock, or documentation only. | No |
| `2 local` | Implemented and repeatably verified in isolated/local tests. | No |
| `3 released` | Present on the immutable production release with health/identity evidence. | No |
| `4 field_proven` | A signed-in user completed the normal path in production; output and recovery evidence retained. | Partially |
| `5 parity_proven` | Locked same-input comparison shows no material loss against the named current competitor. | Yes, for standalone parity |
| `6 connected_superior` | State 5 plus a measured CreativesOS workflow advantage. | Yes, for 100% competitive completion |
| `X intentional_exclusion` | Explicitly out of target workflow, with owner, rationale, alternate path and review date. | Only if approved before the run |

`provider_ready`, `demoed`, `configured`, `queued`, and `not_benchmarked` are
not qualification states.

## Non-negotiable gates

No weighted total can override these gates.

1. Every P0 row is `5 parity_proven` or an approved `X` exclusion.
2. No P0 row has a material output, safety, access-control, loss/recovery or
   accessibility regression.
3. At least 90% of P1 weight is `5 parity_proven`; the remainder has a dated
   corrective plan and is visible to users if it constrains a workflow.
4. The benchmark uses current, authorized versions of the comparison product,
   the same source pack, output target, device/network class and operator
   skill level.
5. A qualified human reviewer accepts the output and records all failures,
   retries, exclusions, active time, elapsed time and cost.
6. Production evidence includes immutable release identity, tenant/role
   authorization, asset lineage, output checksums, and one recovery exercise.
7. Claims expire after 180 days, a material competitor release, a material
   CreativesOS change, or a changed provider/model/version.

## Score model

The score communicates distance; the gates decide the verdict.

For every row, assign a weight and a state score:

`absent=0`, `designed=0`, `local=0.25`, `released=0.45`,
`field_proven=0.65`, `parity_proven=0.85`,
`connected_superior=1.00`.

`rubric score = Σ(row weight × state score) / Σ(in-scope row weights) × 100`

| Verdict | Required score | Required gates |
| --- | ---: | --- |
| `incomplete` | under 70 | No parity claim |
| `functional_candidate` | 70–84 | Field proof may exist; no parity claim |
| `standalone_parity` | 85–94 | All P0/P1 gates above; normal output/control is equivalent |
| `connected_superiority_candidate` | 95–99 | Parity gates plus an unreviewed or single-run efficiency advantage |
| `competitive_complete` | 100 | All gates plus repeatable connected-superiority proof |

To earn `connected_superior` for any workflow, CreativesOS must preserve
standalone quality and demonstrate either **at least 25% less active operator
time** or **at least 50% fewer manual cross-application handoffs**. A stronger
domain metric is allowed only when it is predeclared and independently reviewed.

## Evidence packet required for every scored run

- competitor/source capability snapshot with date, version and primary source;
- signed source-media manifest with checksums and rights/consent status;
- task script, output specification, device/network/operator controls;
- synchronized screen recording or durable action log for both paths;
- exported outputs and machine-readable media analysis;
- quality review: picture, animation timing, typography, captions, audio and
  brand accuracy;
- reliability record: retries, failure modes, recovery, cancellation and data
  or asset loss; 
- access/tenant verification and cost/elapsed/active-time ledger;
- sealed evidence package created with `npm run benchmarks:evidence`.

If either product cannot complete a source-pack task, retain the failure rather
than removing the task from the benchmark.

## Rubric A — Remotion parity

Target job: a developer or creative creates a parameterized, deterministic
motion graphic, previews it, renders variants, revises it safely and delivers
reproducible artifacts.

| P | Capability and acceptance test | Weight | Evidence needed |
| --- | --- | ---: | --- |
| P0 | Composition contract: width, height, FPS, duration, inputs and deterministic frame clock; same inputs reproduce the same output hash/pixel tolerance. | 8 | Two-run artifact comparison and receipt |
| P0 | Motion authoring: sequence, repeat, freeze, interpolation, Bezier easing, spring motion, transforms, opacity, color and timing all agree in preview and export. | 10 | Frame-sampled preview/export comparison |
| P0 | Layer/media model: text, image, video, audio, fonts and nested compositions with correct trim, timing and asset lineage. | 8 | Decoded render and ownership proof |
| P0 | React/TSX authoring: typed SDK, local modules/styles, actionable compiler/runtime diagnostics, cancellation and a safe approved dependency boundary. | 8 | Public production path plus negative security tests |
| P0 | Deterministic rendering: parameter batches, frame ranges, stills/sequences/video, receipts and retry-safe jobs. | 8 | Batch run with idempotency/retry evidence |
| P0 | Security/custody: tenant isolation, no arbitrary network/secret reachability, CPU/memory/output limits, revocation and cleanup. | 8 | Adversarial and recovery evidence |
| P1 | Rich graphics: SVG/path, shapes, gradients, masks, filters, Lottie/Rive and bounded 3D render consistently. | 8 | Layered composition reference artifact |
| P1 | Encoding/delivery: target codecs, alpha where promised, quality controls, audio sync and portable outputs. | 6 | Codec/quality/loudness report |
| P1 | Developer experience: inspectable preview, source revision history, diagnostics, templates, API/CLI or equivalent automation surface. | 4 | Timed normal-workflow recording |
| P1 | Scale: durable scheduling, quotas, metering, cancellation across workers, cold-start and workload SLO evidence. | 6 | Load/recovery run and cost record |
|  | **Total** | **74** | |

Current interpretation: the declarative/native rows have substantial local and
released evidence. Public executable TSX dispatch, full composition
preview/export equality, broad approved dependency coverage, scaled admission
and same-input benchmark evidence remain required before a Remotion parity
claim.

## Rubric B — HyperFrames parity

Target job: a creative or agent turns browser-authored visual content into a
deterministic motion graphic without needing a traditional NLE.

| P | Capability and acceptance test | Weight | Evidence needed |
| --- | --- | ---: | --- |
| P0 | Browser-native motion document with deterministic frame stepping and output. | 10 | Same-document frame and video receipt |
| P0 | Safe authoring/import path for the declared document format, including assets, typography and responsive layout. | 9 | Author/edit/render field journey |
| P0 | Agent/automation contract: structured brief/parameters, bounded generation, revision and artifact lineage. | 8 | Agent action log and human approval |
| P0 | Preview/export equivalence and deterministic retries. | 9 | Sampled pixel and retry comparison |
| P0 | Multi-format variants (16:9, 9:16, 1:1) with legible layout and timing. | 7 | Human design review plus renders |
| P0 | Tenant-safe runtime, asset controls, cancellation, quotas and recovery. | 8 | Isolation and failure tests |
| P1 | Data binding for charts/product/content updates with validated inputs. | 6 | Input-to-output lineage test |
| P1 | Template sharing/versioning and reusable brand components. | 5 | Team edit/revision field test |
| P1 | Hosted render throughput/cost/SLOs appropriate to the target workload. | 5 | Load/cost evidence |
|  | **Total** | **67** | |

CutStudio’s clean-room TSX runtime is directionally similar, but it is not an
HTML-first HyperFrames substitute until the declared authoring format, public
safe render path and agent workflow are actually field-proven.

## Rubric C — Higgsfield cinematic-generation parity

Target job: a creator produces a coherent, controllable cinematic sequence
from a brief and references, reviews variants, and promotes the selected output
into editing/distribution without losing provenance.

| P | Capability and acceptance test | Weight | Evidence needed |
| --- | --- | ---: | --- |
| P0 | Generation execution: text/image/video/reference-to-video jobs reach an approved model and return a usable artifact with provider receipts. | 10 | Live provider round trip |
| P0 | Direction controls: shot, camera movement, lens/focal/aperture, lighting, color, tempo and motion are represented and materially influence output. | 10 | Controlled A/B evaluation |
| P0 | Continuity: reusable cast, location, prop, wardrobe and style references survive a multi-shot sequence. | 10 | Same-brief sequence review |
| P0 | Reference control: first/last frames, multiple approved references and source-rights enforcement. | 8 | Live input/output lineage |
| P0 | Model orchestration: explicit model/version/settings, idempotency, queue/retry/cancel, callback validation and cost visibility. | 8 | Job lifecycle record |
| P0 | Safety: consent, likeness/rights disclosures, provenance, moderation, revocation and policy outcomes. | 8 | Positive and denied cases |
| P1 | Creative iteration: storyboard/shot plan, variants, compare/select/reject/supersede, reproducible prompt/setting history. | 7 | Review journey recording |
| P1 | Quality: temporal consistency, anatomy/physics, visual coherence, camera adherence, audio/lip sync when promised. | 8 | Blind human review and metrics |
| P1 | Team workflow: shared briefs/assets, approvals and direct CutStudio handoff. | 5 | Team field journey |
| P1 | Throughput/cost: target latency, failure rate, cost per accepted second and budget limits. | 6 | Representative production run |
|  | **Total** | **80** | |

The current provider-neutral director/control plane is valuable, but it scores
as implementation evidence only until live model execution and same-brief
quality evidence exist. No provider configuration alone advances these rows.

## Rubric D — creator motion-suite parity

Target job: turn source footage and brand assets into a professional
short-form, launch, education or commerce video with motion graphics, review
and distribution handoff.

| P | Capability and acceptance test | Weight | Evidence needed |
| --- | --- | ---: | --- |
| P0 | Non-destructive multitrack edit, multicam, trim/ripple/roll/slip, proxies, versioning and recovery. | 10 | Golden edit + recovery test |
| P0 | Animated text, lower thirds, captions, shape/vector graphics, brand templates and accessible responsive variants. | 10 | Brand brief visual review |
| P0 | Transform/keyframe/effect/mask/composite controls with preview/export agreement. | 10 | Layered frame comparison |
| P0 | Color/audio finishing sufficient for the target creator output. | 8 | Grading/loudness report |
| P0 | Review, comments, approval, revision and immutable final artifact. | 7 | Time-coded revision journey |
| P0 | Render quality, cancellation/retry, asset isolation and final delivery. | 8 | Production render/recovery record |
| P1 | Advanced graphics: tracking, roto, particles, expressions, GPU effects and imported 3D. | 8 | Only P0 when a declared target workflow requires it |
| P1 | Accessibility and social adaptation: caption accuracy, reframing, keyboard/touch, screen-reader and mobile usability. | 6 | Mobile/accessibility run |
| P1 | Collaboration and operational scale: roles, simultaneous editing conflict behavior, quotas and durable worker recovery. | 7 | Multi-user/load evidence |
| P1 | Connected handoff: source-to-review-to-distribution-to-performance lineage without export/re-upload. | 8 | End-to-end lineage receipt |
|  | **Total** | **82** | |

## Benchmark procedure

1. Freeze the competitor source snapshot and mark each row `required`,
   `optional`, or `intentional_exclusion` before implementation work begins.
2. Choose one normal-workflow source pack per rubric and publish its checksum
   manifest, output specification and reviewer panel.
3. Run CreativesOS and the current competitor independently using identical
   inputs and target outputs. Do not copy a competitor’s protected template,
   source code or assets.
4. Score every row from retained evidence. A failed P0 row fails the verdict;
   do not average it away.
5. Open a dated gap ticket for every row below state 5. Ship, field-test, then
   repeat only the affected benchmark while retaining all earlier evidence.
6. Once standalone parity passes, run the connected loop:
   `brief/capture → CutStudio → review → Distribution → response/automation → performance`.
   Award state 6 only from measured time/handoff and lineage results.
7. Seal the evidence with `npm run benchmarks:evidence`, attach it to the
   Benchmark Lab record, and set a six-month revalidation date.

## Decision authority

Engineering owns source, tests, release identity and failure retention.
Creative reviewers own output acceptability. The product owner approves target
workflows and exclusions. Security/operations own production runtime,
entitlements, cost ceilings and incident/recovery sign-off. No one role may
unilaterally certify 100%.

