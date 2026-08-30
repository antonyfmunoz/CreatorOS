# CreativesOS Creation Studios competitive standard

Last reviewed: 2026-08-30

This studio-specific scorecard inherits the two-bar acceptance model in
[`PRODUCT_WIDE_COMPETITIVE_STANDARD.md`](./PRODUCT_WIDE_COMPETITIVE_STANDARD.md).
Functional completion, standalone parity and connected superiority are
reported separately.

## Product standard

CutStudio and Broadcast are not measured by whether they visually imitate a
single incumbent. They are measured against the complete job a creative needs
to do: capture, produce, edit, review, distribute, automate, learn, and
monetize without leaving CreativesOS.

The target is:

1. parity on the controls required to publish professional creator content;
2. equivalent professional output for the bounded creator workflow before
   integration benefits are counted;
3. a shorter end-to-end workflow than a collection of disconnected tools;
4. private-by-default assets, explicit rights confirmation, durable jobs, and
   observable output health;
5. clean-room implementation using CreativesOS code and public protocols; and
6. an honest external gate wherever a provider, device, codec licence, or
   specialized workstation capability is required.

“Better than competitors” therefore means better for the CreativesOS creator
distribution workflow. It does not mean reproducing every specialist VFX,
finishing, hardware-I/O, or third-party plug-in feature in Premiere Pro,
DaVinci Resolve, or OBS Studio.

## Primary comparison set

The current comparison set is Adobe Premiere Pro, DaVinci Resolve, Descript,
CapCut, Remotion, Higgsfield, Open Generative AI, OBS Studio, StreamYard,
Restream, Riverside, Streamlabs, PRISM Live Studio, Larix Broadcaster, and IRL
Pro. Feature claims must be checked against primary product documentation
before this scorecard is revised. The expanded CutStudio requirements and
clean-room boundary are canonical in
[`CUT_STUDIO_PROGRAMMABLE_CINEMA_STANDARD.md`](./CUT_STUDIO_PROGRAMMABLE_CINEMA_STANDARD.md).

## CutStudio scorecard

| Capability | Current baseline | Competitive target | Gate |
| --- | --- | --- | --- |
| Private ingest and projects | Implemented | Maintain | None |
| Non-destructive timeline | EDL v3 with absolute positioning, eight video and eight audio tracks, split/trim, speed, volume, fades, undo/redo, durable markers, boundary snapping, synchronized clip groups, render-effective multicamera groups and angle switches, direct pointer/touch placement, precision trim handles, track-local and linked cross-track ripple, rolling edits, source-slip edits, durable source/timeline dual monitors with source in/out marking and playhead insertion, and durable compound timelines that compile to the flat render graph | Add nested compound effects only when the bounded creator workflow demonstrates a need | Product code and generated-media browser qualification |
| Text-based editing | Search, correction, speaker labeling, durable segment rearrangement into the primary story timeline, and batch filler/dead-air review implemented | Add multi-speaker automatic diarization when the transcription adapter supports it | Product code complete for manual workflow; transcription provider for new transcripts and automatic diarization |
| Captions | Three static burn-in styles, a render-effective word-level kinetic caption style, and corrected SRT sidecar export | Add translated caption tracks | Native animation complete; translation provider for translation |
| Social reframing | Render-effective landscape, square and portrait fit/pad | Add subject-aware reframing | Vision compute for subject tracking |
| Audio repair | Per-clip volume/fades, render-effective volume keyframes with linear/eased interpolation and reusable fade/dip presets, media-derived audio waveforms, realtime RMS signal meter, rolling three-second K-weighted LUFS-S meter, private-source EBU R128 analysis with integrated LUFS/loudness-range/true-peak evidence, audio beds, automatic voice-over ducking, denoise, master gain, and voice/music/broadcast EQ, compression, loudness normalization and true-peak limiting | Maintain calibrated offline evidence alongside the live operator meter | Product code and generated-media browser qualification |
| Multitrack edit | Private project media library plus real B-roll/PIP, audio beds, synchronized clip grouping, durable named compounds, render-effective track lock/visibility/mute/solo/gain controls, named dialogue/music/effects buses, a reusable creator-mix routing preset, business-scoped team templates for routing/ducking/finishing, and timed native title/lower-third/callout graphics rendered by FFmpeg | Add additional buses only when real production evidence exceeds the dialogue/music/effects model | Product code and generated-media browser qualification |
| Visual finishing | Per-clip position/size/opacity, render-effective linear and ease-in-out position/scale/opacity keyframes, reusable slide/zoom/fade/rise motion presets, aspect render, cut/fade-through-black/cross-dissolve transitions, grade presets, exposure/contrast/saturation/temperature controls with editor preview, private validated `.cube` LUT import with render-time ownership enforcement, and chroma key for overlays | Maintain and expand presets based on production-team evidence | Product code and generated-media browser qualification |
| Review/collaboration | Immutable versions, hashed expiring/revocable review links, private playback, time-coded comments, change requests, approvals, owner resolution, synchronized side-by-side comparison, signed-in project collaborators, private workspace notes and participant-scoped @mention notifications implemented | Maintain and qualify with production teams | Product code and signed-in team field qualification |
| Render/delivery | Private H.264/AAC render, quality profiles, estimate, failed-job retry, real running-job cancellation with artifact cleanup, original-safe private editing proxies, and distribution promotion | Add a scalable 4K worker tier with durable cross-machine cancellation | Product code and scalable compute |
| AI assistance | Deterministic edit proposals and highlights | Provider-neutral assistance with human review | AI providers remain optional adapters |
| Programmable compositions | Versioned parameter, layer, keyframe, easing, transition, effects, font, data-binding, 3D/vector/interactive-media and audio-reactive contracts; deterministic evaluator; compilation of the safe media/text/shape/path subset into EDL v3; starter templates; visual authoring with owned project video/audio selection; allowlisted vector/path, 3D, geometric-transition, animated-filter and bounded-effect browser preview; typed parameter resolution and idempotent batches of up to 20 durable named variants; sampled title/shape/path position and opacity, rounded shape geometry and inert path strokes compiled into final FFmpeg output | Image/font/Lottie/Rive/Three media selection, general SVG, final-render graphic scale, rotation, advanced transition/effect and native Lottie/Rive/Three parity plus isolated code execution | Native persistence, expanded browser renderer, batch variants, project-media selection, rendered title translation, moving rounded shapes and allowlisted path output are locally qualified; protected releases and the remaining final renderer remain; executable code additionally requires isolated compute |
| Cinematic generation | Durable brief, cast/location/prop/wardrobe/product/style/sound continuity, consent/disclosure, shot/lens/camera/lighting/color/audio control, normalized model operations, idempotent jobs, retry/cancel, variants and portable workflow graphs with general node/edge/output authoring | Execute and benchmark a same-brief multi-shot sequence against the approved Higgsfield workflow | Provider-independent control plane and authoring are implemented; model execution and quality proof require approved compute |

## Broadcast scorecard

| Capability | Current baseline | Competitive target | Gate |
| --- | --- | --- | --- |
| Scene composer | Reusable solo, interview, presentation and countdown scenes, complete custom scene presets, business-scoped cross-studio scene/source catalogs, owner/editor/viewer team studio collaboration, and immutable bounded configuration history with authorized rollback implemented | Maintain and qualify restoration behavior with production teams | Product code and owner-scoped collaboration field tests |
| Preview/program | Live low-resolution scene multiview, PGM/PVW labels, cut/fade/dip/wipe/slide transitions, production hotkeys, and a dedicated authenticated phone controller | Maintain | Product code and mobile/desktop browser qualification |
| Sources | Camera, screen, mic, media, image, text, color and test pattern; decks are captured through screen or private media, and common browser-widget jobs are native sources | Add guest feeds. Do not execute arbitrary third-party URLs inside program output until an explicit SSRF, embed-permission and script-isolation policy is approved | Guest transport uses the realtime provider; arbitrary URL sources are a security/product decision rather than an implied implementation gap |
| Source control | Transform, crop, layer, blend, basic visual filters, adjustable chroma key, private validated `.cube` LUT import with per-source GPU trilinear color transforms rendered into program output, mute/volume, reusable render-effective source presets, high/low-pass audio filters, dynamics compression, independent program/monitor routing, named dialogue/music/effects submix buses with live gain and mute, audio sync delay, stereo balance, local monitoring, and per-source device echo cancellation, noise suppression and automatic gain | Maintain and qualify against representative camera, screen, image, and media sources | Product code; browser/device capability limitations are disclosed at the control |
| Brand production | Lower thirds, tickers, countdowns, asset logos, persistent studio colors, reusable account brand library, business-scoped production-template catalog, a private role-gated business media library, role-shared studio configuration and adjustable one-shot fade/slide/rise/wipe/pop entrances plus continuous pulse motion | Expand presets from production-team evidence | Product code |
| Output formats | 720p/1080p landscape, portrait and square at 24/30/60, plus per-destination program/landscape/portrait/square encodes with fit or fill framing and shared-variant deduplication | Maintain | Product code and generated FFmpeg output qualification |
| Destinations | Secure simultaneous fan-out to as many as eight RTMP/RTMPS/SRT destinations with per-output failure isolation, bounded automatic FIFO recovery and durable destination receipts | Add fully independent regional encoder workers and provider-native health callbacks | Product code and scalable compute; destination accounts remain providers |
| Recording | Private server or browser program recording, replay buffer, browser pause/resume, durable production markers, and opt-in direct source-quality camera/screen/microphone tracks with an owner-scoped private recording manifest | Add remote guest local-quality tracks when guest transport is activated; qualify long-duration capture against target devices | Product code complete for locally attached sources; remote guest/device constraints and production duration qualification apply |
| Guests/roles | Realtime community-room foundation exists | Backstage, producer, host, guest and AI-role participation in the studio | Product code; realtime provider activation |
| Audience | Native signed-in audience room, durable moderation queue, program-rendered featured comments and HTTPS calls to action implemented | Normalize supported external live comments into the same control surface | Native product code complete; channel APIs remain providers |
| Field/IRL production | One-time device pairing, hashed device credentials, replay-protected telemetry, bounded history, SRT/WHIP/RTMPS and H.264/H.265/AV1 capability negotiation, bonded-link awareness, adaptive bitrate/resolution/FPS directives, local recovery-recording policy, disconnect-slate contract, battery/thermal/storage health, location-off-by-default privacy, and studio/phone director controls for live/standby/pause, capture mode, camera/lens/torch/microphone and recording | Ship and qualify the native Android/iOS capture shell against representative devices and mobile networks | Provider-independent control plane complete; native device application and long-duration device/network field evidence remain device gates |
| Reliability | Encoder test, live health, interruption reconciliation, output isolation and bounded automatic reconnect implemented | Independently supervised regional encoder failover and chaos qualification against authorized provider sandboxes | Product code, production infrastructure and provider test destinations |

## CreativesOS advantage

The defensible advantage is the connected loop:

`Broadcast recording -> CutStudio project -> highlights/captions -> Distribution Studio -> unified inbox automation -> marketplace/earnings -> performance feedback`

The native loop is now field-proven on mobile and desktop with one generated
source: private Broadcast program and isolated track, idempotent CutStudio
handoff, transcript correction, deterministic highlights, kinetic-caption
render, public promotion into a preselected Distribution Studio draft, native
publication, post-scoped keyword automation, a second-user comment, public
reply, direct message, and post analytics. The lineage remains visible from the
published queue back to the source edit without an export or re-upload.

The studios only qualify as competitively complete when that loop has durable
receipts, user-visible status, owner/role authorization, retry behavior, and a
production field test. A rendered control without an operational path does not
count as implemented.

## Release gates

- Repository qualification: types, build, unit/integration tests, migrations,
  security scan, bundle budget and critical browser journeys.
- Deployment health: production migration, readiness endpoint, runtime health,
  storage and encoder availability.
- Production identity: signed-in owner, role checks and tenant isolation.
- Live round trip: real upload/capture, edit or scene change, output artifact,
  private playback, and distribution promotion.
- External authorization: separately proven for every streaming/social channel;
  never inferred from configured environment variables.
