# CutStudio programmable cinema standard

Last reviewed: 2026-08-30

## Outcome

CutStudio is one connected production environment with three native surfaces:

1. a conventional non-destructive editor for recorded media;
2. a programmable motion-graphics runtime for parameterized, data-driven video;
3. a cinematic generative-production system for briefs, cast/world continuity,
   shot direction, model workflows, variants, review, finishing and delivery.

The acceptance bar remains direct substitution parity for each bounded normal
workflow before CreativesOS integration advantages are counted. Sharing a
Media Cloud or Distribution button does not compensate for a missing creation
control or worse professional output.

## Source and licensing boundary

- [Remotion documentation](https://www.remotion.dev/docs/) informs the user
  jobs: parameterized video, a player, browser/server rendering, animation,
  captions, templates, fonts, audio, transitions, vector/3D/Lottie/Rive
  media, and motion-graphics authoring.
- [Remotion's license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
  is not the implementation license for CutStudio. CreativesOS does not copy,
  embed, repackage or sell a Remotion derivative. Its composition schema,
  evaluator, compiler and renderer boundary are clean-room CreativesOS code.
- [Higgsfield AI Video](https://higgsfield.ai/ai-video),
  [Cinema Studio](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio),
  and [cinematic video generator](https://higgsfield.ai/cinematic-video-generator)
  inform the cinematic workflow: reusable subject/world references, first and
  last frames, camera/lens/focal controls, stacked motion, variants, video
  transformation, pacing, finishing and collaborative production.
- [Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI) is an
  MIT-licensed architecture reference. CutStudio adopts the compatible
  capability-catalog, normalized input-slot and submit/poll/cancel concepts,
  but rejects browser-held API keys, local-only history, unbounded provider
  URLs, safety bypasses and provider output without tenant lineage.

## Native contract

| System | Native implementation | Current gate |
| --- | --- | --- |
| Composition | Durable tenant-scoped manifest with dimensions, FPS, duration, background, parameters, layers, fonts, metadata and audio-reactive signals; typed parameter binding and idempotent batches of up to 20 durable variants | Schema/routes are production-qualified; expanded authoring and batch variants are locally field-qualified pending their protected releases |
| Layers | Video, audio, image, text, shape, allowlisted SVG/path, caption, Lottie, Rive, 3D and data descriptors; absolute timing, transforms, perspective, blend modes and bindings; visual add, duplicate, delete, reorder, timing, transform, content and style controls; normal-user project video/audio selection; safe vector/path, data and 3D browser preview; bounded filled shapes and allowlisted path commands compile into the native final-render graph | Image/font/Lottie/Rive/Three media pickers, general sanitized SVG rendering and native interactive-media playback remain renderer work |
| Motion | Ordered keyframes, deterministic interpolation, linear/ease/spring/step behavior, geometric wipe/iris/clock and 3D flip transitions, animated blur/brightness/saturation, bounded effects and an exact-frame scrubber; normal-user keyframe, transition and effect authoring; sampled text/shape/path position, opacity, scale and Z-rotation plus static X/Y rotation and perspective compile into the bounded raster/FFmpeg graph | Animated 3D/flip, advanced transitions/effects and interactive-media parity remain renderer work |
| Templates | Editable kinetic title, lower-third and product composition starters | Expand through real creative-team evidence |
| Code composition | Pinned source and lockfile assets, denied network, CPU/memory/output quotas, isolated runtime only | Approved sandbox/container capacity; never execute in the web process |
| Brief | Objective, audience, genre, era, tone, requirements, exclusions, references, aspect, resolution, FPS and pacing | Production field proof |
| Continuity | Cast, location, prop, wardrobe, product, style and sound elements with references, traits, locks, consent and synthetic-identity disclosure | Reference comparison and automatic continuity scoring require model compute |
| Shot craft | Operation, prompt/negative prompt, duration, format, seed, references, camera body, lens, focal length, aperture, shutter, ISO, stock, three stacked moves, lighting, emotion, grade and audio mode | Production field proof; model execution is external |
| Safety | Ready private business assets only; explicit media rights; likeness consent for cast; synthetic-media disclosure; tenant authorization | Provider-specific safety and deletion evidence |
| Model catalog | Explicit allowlist, secret presence, advertised operations and local/cloud routing status | Activate one or more approved adapters |
| Workflow graph | Versioned nodes, normalized media slots, model/provider selection, prompts, parameters, upstream outputs, coordinates and named outputs; visual add/remove/edit/reposition, cycle-safe typed connections, connection removal and named-output authoring | Native authoring is locally field-qualified; execution worker remains external/model work |
| Job lifecycle | Idempotent durable request, pending/queued/running/done/error/cancelled states, bounded retry, progress and provider receipt fields | Adapter dispatch, polling/webhooks and artifact ingest remain external/model work |
| Variants | Durable generated variants, provenance, private asset linkage and selected shot; declarative composition batches retain source composition, batch and index lineage | Adapter callback and production selection field proof |
| Conventional finish | Existing CutStudio timeline, audio, captions, color, multicam, review and distribution path | Existing bounded workflow is locally qualified; new runtime needs its own release evidence |

## Direct parity matrix

| Bounded job | Remotion-class bar | Higgsfield-class bar | CutStudio release criterion |
| --- | --- | --- | --- |
| Parameterized video | Typed/editable inputs alter deterministic output without hand-editing every variant | Campaign/project variants preserve intent | One template renders at least three parameter sets with reproducible frame evidence |
| Motion graphics | Timeline, keyframes, easing, transitions, vector/text/media/3D and audio-reactive graphics | Cinematic overlays and finishing integrate with generated shots | Same brief produces editable composition, preview and final private render |
| Programmable creation | Project code is isolated, dependency-pinned and renderable at scale | Not the comparison focus | Untrusted code cannot access tenant secrets/network or exceed quota; cancellation and cleanup pass |
| Cinematic control | Compositions can express precise time and presentation | Camera/lens/focal/lighting/movement/first-last-frame controls materially affect results | Same locked prompt demonstrates every control with retained settings and provenance |
| World continuity | Template/data continuity is possible | Cast, locations, props and references remain coherent across shots | Three-shot locked sequence passes human identity/wardrobe/location/prop review |
| Multi-model workflow | Integrations can be composed around a renderer | Model choice and iterative generation are unified | One image-to-video-to-audio graph runs with durable node/job/artifact lineage |
| Edit after generation | Generated material can continue into editing | Video edit/extend/transform and variants are central | Selected variant opens in the existing non-destructive timeline without export/re-upload |
| Team review | Application integration supports review systems | Shared production and iteration are expected | Editor/reviewer authority, notes, versions, approval and selected variant are production-proven |

## Security and execution architecture

Declarative compositions are the default and may compile into the existing
safe EDL/render graph. Executable compositions are a separate capability. A
request stores immutable source and lockfile asset identifiers and resource
limits; an external isolated executor receives a tenant-scoped job and returns
only bounded artifacts and logs. Network access is denied by default.

Cloudflare Sandbox is one possible paid executor, not a dependency hidden in
the feature claim. Its [security model](https://developers.cloudflare.com/sandbox/concepts/security/)
provides isolated containers, while CreativesOS must still enforce user
authorization, input validation, quotas, rate limits and cleanup. A self-hosted
container pool is the portable alternative. The product decision is deferred
until workload/cost evidence exists; the native capsule contract is compatible
with either.

## Remaining release sequence

1. **Completed:** migration `0114_cut_studio_programmable_cinema.sql` is in
   production on release `613ad52277ad65fe0ec36397ddbc631752f3974a`.
2. **Completed:** owner/editor/reviewer, cross-tenant denial, private-asset
   injection denial and persistence pass protected browser qualification.
3. **Browser side implemented and locally field-qualified:** extend the shared
   evaluator and scrubber across allowlisted vector/path, data, 3D, geometric
   transition and bounded visual-effect rendering; complete native
   Lottie/Rive/Three playback and safe final-render parity.
4. **Implemented and locally field-qualified:** general layer, timing,
   transform, keyframe, transition, effect, node, edge, operation, provider,
   model, position and output authoring; complete its protected release.
5. **Implemented and locally field-qualified:** validate typed composition
   parameters, bind them into text/transform/style targets and create an
   idempotent durable batch of up to 20 named variants; complete its protected
   release and final-render evidence.
6. **Implemented and locally field-qualified:** compile sampled title position
   and opacity from the declarative evaluator into final FFmpeg rendering and
   prove translation with pixels from two frames of a private artifact;
   complete its protected release and the remaining advanced properties.
7. **Implemented and locally field-qualified:** select owned project video or
   audio from the composition authoring controls, preserve exact asset IDs in
   the manifest and compile simultaneous media layers onto stable primary and
   overlay tracks; complete its protected release and expand media pickers.
8. **Implemented and locally field-qualified:** compile bounded filled shape
   layers into the final FFmpeg render graph and verify their color at an exact
   private-artifact pixel; complete its protected release and add shape motion
   plus vector/path renderers.
9. **Implemented and locally field-qualified:** validate inline path data
   against an inert command/number grammar, rasterize it through the existing
   Sharp runtime and render the exact stroke into the private artifact;
   complete its protected release and add general sanitized SVG rendering.
10. **Implemented and locally field-qualified:** route shapes and paths through
    one private raster overlay graph, preserve rounded shape geometry and apply
    sampled X/Y/opacity motion in final FFmpeg output; complete its protected
    release and add graphic scale/rotation.
11. **Implemented and locally field-qualified:** render bounded shape/path
    scale and Z-rotation with transparent maximum-footprint padding so motion
    is neither clipped nor position-shifted; complete its protected release
    and add the remaining text/3D transform path.
12. **Implemented pending qualification:** rasterize normal-user text, caption
    and lower-third layers with the installed production font and route them
    through the same bounded scale/Z-rotation graph as vector graphics; prove
    final-artifact translation, scale and rotation in mobile and desktop runs.
13. **Implemented pending qualification:** preserve static X/Y rotation and
    perspective on safe raster graphics, project their exact 3D quadrilateral
    through FFmpeg and prove non-rectilinear row geometry in the final private
    artifact; animated 3D/flip remains part of advanced transition work.
14. Activate and qualify at least one approved model adapter and one isolated
   code executor, with secrets, rate limits, cancellation, timeout, artifact
   lineage, privacy export/deletion and failure recovery.
15. Run the direct substitution benchmark using locked briefs/assets and human
   quality review. Only then may the relevant parity verdict change from
   `not_benchmarked`.
