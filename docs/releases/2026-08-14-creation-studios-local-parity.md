# 2026-08-14 creation studios local parity closure

## Outcome

The provider-independent CutStudio and Broadcast scope is locally qualified.
The work closes the web-runtime and backend foundation needed for connected
professional editing, studio production and native-capable IRL capture without
pretending that browser code is a shipped Android/iOS capture application or
that unconfigured third-party destinations have been field-tested.

## CutStudio

- Broadcast sessions can materialize a lineage-preserving multicam project
  with synchronized program and isolated source angles.
- Editors can switch active angles on the timeline and the chosen angle is
  reflected in the rendered output.
- Private H.264/AAC editing proxies are idempotent and retain explicit source
  lineage; final rendering continues to use the original asset.

## Broadcast

- Program/preview multiview includes throttled live scene thumbnails and
  operator transitions.
- Provider-neutral native audience widgets cover chat, events, goals,
  sponsors and tips.
- Destinations can independently request program, landscape, portrait or
  square output with fit/fill framing; identical variants are deduplicated.
- A protected phone controller can select/take scenes, control sources, place
  markers, stop safely and direct paired field nodes.
- Field nodes use one-time claims and hashed bearer credentials, reject replay,
  report network/device/recording telemetry, receive adaptive continuity
  directives and expose privacy-safe camera, audio, recording and location
  controls.

## Qualification

- 74 unit/integration files, 302 tests: passed.
- TypeScript, production builds, Worker dry run and bundle budgets: passed.
- 124 isolated PostgreSQL browser executions across mobile and desktop: passed.
- Empty-database migration qualification: 83 migrations passed.
- Backup/restore, relationship release, secret scan, production dependency
  audit and capacity checks: passed.
- Capacity sample: 200 requests at concurrency 20, zero failures.

## Remaining gates

The following are deliberately outside this local closure: production release
and post-release checks; an installable Android/iOS field-capture shell and
real-device/network endurance testing; live provider destinations and remote
guests; regional encoder failover; external AI/transcription/model behavior;
and the authorized human competitive benchmarks defined by the golden standard.
Arbitrary third-party URL sources are also intentionally excluded until the
product approves an SSRF, embed-permission and untrusted-script isolation
policy; decks remain available through screen capture or private media, and
the common live-widget jobs are native sources.

## Production release evidence

Commit `374a8f6` deployed as Fly release v307. The release command and the
post-deployment verifier both confirmed all 83 migrations, `/api/health`
returned `ok`, `/api/ready` returned `release_ready`, and the active machine
passed its HTTP health check with R2 private delivery configured.

The signed-in production field test created an isolated Broadcast studio,
added an interview scene and native goal widget, took the scene through a wipe
transition, generated a one-time field pairing invitation, and used the phone
controller at 390x884 to return the main scene to program with no horizontal
overflow. The temporary studio was then deleted. CutStudio created a real
private editing proxy for the existing field-test source and reported that
final renders still use the original media.

## Field-camera continuation

The next provider-independent slice adds an installable browser field-camera
surface rather than stopping at a pairing API. A one-time link claims a
session-only device credential, previews camera/microphone or user-approved
screen capture, obeys director state/camera/mute/recording commands, reports
privacy-safe device telemetry and stores downloadable recovery segments in the
device browser. Browser-native WebRTC and VP8/VP9 are represented truthfully in
the shared protocol instead of being mislabeled as SRT/H.264.

When LiveKit is configured, the field device receives a short-lived,
studio-scoped publish-only token and the Broadcast operator receives a
subscribe-only token. The resulting feed can be inserted into Preview and
transitioned to Program; reusable scene/source presets strip the physical
capture-node binding. Focused unit and isolated mobile/desktop browser
qualification pass, followed by the complete 126-execution browser matrix,
75 unit/integration files with 307 assertions, TypeScript/build/Worker/bundle
gates, relationship release, backup/restore, a clean 581-file source-secret
scan, zero production dependency vulnerabilities and a 200-request capacity
probe with zero failures. Production deployment and a two-device live-media field
test are recorded separately after release.
