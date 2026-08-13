# CreativesOS Creation Studios competitive standard

Last reviewed: 2026-08-13

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
CapCut, OBS Studio, StreamYard, Restream, and Riverside. Feature claims must be
checked against primary product documentation before this scorecard is revised.

## CutStudio scorecard

| Capability | Current baseline | Competitive target | Gate |
| --- | --- | --- | --- |
| Private ingest and projects | Implemented | Maintain | None |
| Non-destructive timeline | EDL v3 with absolute positioning, eight video and eight audio tracks, split/trim, speed, volume, fades, undo/redo, durable markers, boundary snapping, synchronized clip groups, direct pointer/touch placement, precision trim handles, track-local and linked cross-track ripple, rolling edits, source-slip edits, and durable compound timelines that compile to the flat render graph | Add source/record dual-monitor trimming and nested compound effects only when the bounded creator workflow demonstrates a need | Product code and generated-media browser qualification |
| Text-based editing | Search, correction, speaker labeling, durable segment rearrangement into the primary story timeline, and batch filler/dead-air review implemented | Add multi-speaker automatic diarization when the transcription adapter supports it | Product code complete for manual workflow; transcription provider for new transcripts and automatic diarization |
| Captions | Three static burn-in styles, a render-effective word-level kinetic caption style, and corrected SRT sidecar export | Add translated caption tracks | Native animation complete; translation provider for translation |
| Social reframing | Fixed aspect fit/pad | Landscape, square, portrait and subject-aware reframing | Product code; vision compute for subject tracking |
| Audio repair | Per-clip volume/fades, render-effective volume keyframes with linear/eased interpolation and reusable fade/dip presets, media-derived audio waveforms, realtime RMS signal meter, private-source EBU R128 analysis with integrated LUFS/loudness-range/true-peak evidence, audio beds, automatic voice-over ducking, denoise, master gain, and voice/music/broadcast EQ, compression, loudness normalization and true-peak limiting | Add continuously updating LUFS metering | Product code and generated-media browser qualification |
| Multitrack edit | Private project media library plus real B-roll/PIP, audio beds, synchronized clip grouping, durable named compounds, render-effective track lock/visibility/mute/solo/gain controls, named dialogue/music/effects buses, a reusable creator-mix routing preset, and timed native title/lower-third/callout graphics rendered by FFmpeg | Expand routing presets into business-scoped team templates when production teams require shared standards | Product code and generated-media browser qualification |
  | Visual finishing | Per-clip position/size/opacity, render-effective linear and ease-in-out position/scale/opacity keyframes, reusable slide/zoom/fade/rise motion presets, aspect render, cut/fade-through-black/cross-dissolve transitions, grade presets, exposure/contrast/saturation/temperature controls with editor preview, private validated `.cube` LUT import with render-time ownership enforcement, and chroma key for overlays | Maintain and expand presets based on production-team evidence | Product code and generated-media browser qualification |
| Review/collaboration | Immutable versions, hashed expiring/revocable review links, private playback, time-coded comments, change requests, approvals, owner resolution, synchronized side-by-side comparison, signed-in project collaborators, private workspace notes and participant-scoped @mention notifications implemented | Maintain and qualify with production teams | Product code and signed-in team field qualification |
| Render/delivery | Private H.264/AAC render, quality profiles, estimate, failed-job retry, real running-job cancellation with artifact cleanup, and distribution promotion | Add a scalable 4K worker tier with durable cross-machine cancellation | Product code and scalable compute |
| AI assistance | Deterministic edit proposals and highlights | Provider-neutral assistance with human review | AI providers remain optional adapters |

## Broadcast scorecard

| Capability | Current baseline | Competitive target | Gate |
| --- | --- | --- | --- |
| Scene composer | Reusable solo, interview, presentation and countdown scenes, complete custom scene presets, business-scoped cross-studio scene/source catalogs, and owner/editor/viewer team studio collaboration implemented | Expand the catalog with version history when production teams demonstrate a rollback need | Product code and owner-scoped collaboration field tests |
| Preview/program | Cut, fade and production hotkeys | Maintain | Product code |
| Sources | Camera, screen, mic, media, image, text, color, test pattern | Browser/deck sources, guest feeds and reusable brand graphics | Product code; guest transport uses realtime provider |
| Source control | Transform, crop, layer, blend, basic visual filters, adjustable chroma key, mute/volume, reusable render-effective source presets, high/low-pass audio filters, dynamics compression, independent program/monitor routing, audio sync delay, stereo balance, local monitoring, and per-source device echo cancellation, noise suppression and automatic gain | LUT and named auxiliary mix buses | Product code; browser/device capability limitations are disclosed at the control |
| Brand production | Lower thirds, tickers, countdowns, asset logos, persistent studio colors, reusable account brand library, business-scoped production-template catalog, role-shared studio configuration and adjustable fade/slide/pulse overlay motion | Organization-wide media libraries and expanded motion presets | Product code |
| Output formats | 720p/1080p landscape, portrait and square at 24/30/60 | Maintain and add destination-specific framing when justified | Product code |
| Destinations | Secure simultaneous fan-out to as many as eight RTMP/RTMPS/SRT destinations with per-output failure isolation, bounded automatic FIFO recovery and durable destination receipts | Add fully independent regional encoder workers and provider-native health callbacks | Product code and scalable compute; destination accounts remain providers |
| Recording | Private server or browser program recording, replay buffer, browser pause/resume, durable production markers, and opt-in direct source-quality camera/screen/microphone tracks with an owner-scoped private recording manifest | Add remote guest local-quality tracks when guest transport is activated; qualify long-duration capture against target devices | Product code complete for locally attached sources; remote guest/device constraints and production duration qualification apply |
| Guests/roles | Realtime community-room foundation exists | Backstage, producer, host, guest and AI-role participation in the studio | Product code; realtime provider activation |
| Audience | Native signed-in audience room, durable moderation queue, program-rendered featured comments and HTTPS calls to action implemented | Normalize supported external live comments into the same control surface | Native product code complete; channel APIs remain providers |
| Reliability | Encoder test, live health, interruption reconciliation, output isolation and bounded automatic reconnect implemented | Independently supervised regional encoder failover and chaos qualification against authorized provider sandboxes | Product code, production infrastructure and provider test destinations |

## CreativesOS advantage

The defensible advantage is the connected loop:

`Broadcast recording -> CutStudio project -> highlights/captions -> Distribution Studio -> unified inbox automation -> marketplace/earnings -> performance feedback`

The first handoff is now native and durable: a completed Broadcast recording can
open directly as an idempotent CutStudio multitrack project, carrying the private
program asset, available isolated source recordings, production markers, tenant
ownership, and source lineage without an export or re-upload.

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
