# Creation Studios golden benchmark handoff

Last prepared: 2026-08-14

This is the remaining competitive-evidence gate for CutStudio and Broadcast.
It is not an implementation backlog. Native provider-independent functionality
is qualified separately in `CREATIVESOS_END_STATE_PARITY.md`.

## Locked evidence rules

Every comparison run must use:

- the same source media and show plan;
- the same output resolution, frame rate, aspect, loudness and caption target;
- the same device class, network class and operator skill level;
- current authorized accounts for each comparison product;
- no copied competitor code, assets or protected interface expression;
- screen recording or an equivalent durable action log;
- the exported artifact, review notes and failure evidence, including failed
  runs rather than only the best result.

The reviewer must record active operator time, elapsed time, user actions,
applications used, exports, uploads, manual handoffs, retries, review cycles,
output fidelity, accessibility and recovery behavior. CreativesOS only reaches
`connected_advantage_proven` when standalone quality is not materially worse
and it uses at least 25% less active operator time or 50% fewer manual
cross-application handoffs.

## CutStudio locked workflow

1. Import the shared landscape camera source, screen recording, B-roll, music,
   brand image and transcript.
2. Produce a 60-90 second edit with a dialogue-first story, one B-roll/PIP
   section, one title, one lower third, one transition, one transcript
   correction and one removed filler/dead-air segment.
3. Apply voice finishing, music ducking, a visual grade and publish-safe
   loudness/true-peak controls.
4. Create a multicamera group, make at least three timed angle switches, use a
   lightweight editing proxy, and prove that the approved render still uses
   the original source lineage.
5. Produce landscape and vertical variants with captions.
6. Send a time-coded review, make one requested change and render the approved
   master.
7. In CreativesOS, continue directly into Distribution without exporting and
   re-uploading the approved master.

Comparison family: CapCut, Descript, Premiere Pro and DaVinci Resolve. The
reviewer must explicitly state which product and version was actually tested;
untested products remain `not_benchmarked`.

## Broadcast locked workflow

1. Build a branded show with camera, screen, microphone, media, title, lower
   third, ticker and countdown sources.
2. Prepare at least three scenes and verify live multiview, preview/program
   switching, all supported transitions, source order, chroma/color treatment,
   audio routing, sync, balance, monitoring, and one native audience widget.
3. Pair a field device, direct it through ready/live/standby/pause, exercise
   camera/microphone/recovery-recording controls, and retain telemetry during a
   network degradation/recovery cycle. Repeat phone control at the target
   mobile viewport.
4. Produce simultaneous landscape and portrait destination variants and record
   the dimensions, framing mode, encoder load, output isolation and recovery.
5. Record a 20-minute show with one pause/resume, one marker, one replay-buffer
   capture and isolated local source tracks.
6. Exercise an output interruption and demonstrate recovery without losing the
   local recording or configuration.
7. Open the completed program and isolated sources directly in CutStudio while
   preserving markers and lineage.

Comparison family: OBS Studio, StreamYard, Restream, Riverside, Streamlabs,
PRISM Live Studio, Larix Broadcaster and IRL Pro. Remote guest quality,
native-device capture quality and external destination delivery are scored only
after the relevant providers, devices and authorized destination accounts are
activated.

## Connected-workflow comparison

The disconnected baseline must complete the same show, edit, review,
distribution preparation and audience-follow-up sequence using the comparison
products. Record every export, upload, copy/paste, identity switch, permission
re-entry and manual relationship/performance update. Compare it with the
CreativesOS native golden journey that preserves one asset and event lineage
from Broadcast through post performance.

## Required human handoff

Engineering cannot close this evidence gate alone. A qualified operator must
provide authorized competitor accounts, run or supervise the locked workflows,
and approve the visual/audio result. The benchmark record must include the
operator, date, product versions, source-pack identifier, device/network class,
measured results, failures, exclusions and final verdict.
