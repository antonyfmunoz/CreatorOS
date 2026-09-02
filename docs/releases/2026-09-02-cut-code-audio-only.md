# Bounded audio-only exports

The isolated prototype now supports explicit soundtrack-only requests producing
PCM16 WAV, MP3 or AAC in M4A. It shares video track planning, private-file probing,
retiming, automation, limiting and range alignment. No React code is executed
and no browser starts for this mode. Empty mixes produce exact silence; invalid
sources remain failures. Requests are bounded to 120 seconds and existing
64-MB artifact, one-CPU, 2-GB, no-network and independent deadline limits.

This closes a concrete encoding capability identified in the
[Remotion encoding guide](https://www.remotion.dev/docs/encoding), not general
Remotion compatibility or production availability. AAC is deliberately in M4A,
not raw ADTS. There is no arbitrary encoding command or dependency admission.

Local evidence:

- All 31 runtime unit/type/receipt tests passed.
- The full isolated qualification passed with image config
  `sha256:88f1c2cb164ab461e3b6beb86379de42d329742c368d1403a3120b13916df5dc`.
- Actual WAV/MP3/M4A artifacts independently probed as exactly one audio stream,
  expected codec, 48-kHz stereo; decoded gain, held onset and final mute passed.
- WAV exact sample counts, continued range envelope, empty-mix silence and
  byte-identical replay passed. A throwing visual entrypoint did not execute.
- Missing source and source overrun failed at audio admission. All existing
  pixels, private styles/video/audio, alpha reuse, timeout and cancellation tests
  still passed. No protected thresholds or deadlines were weakened.

Evidence log: `B:/CreativesOS-task-artifacts/audio-only-isolated.log`.
Protected exact-source qualification is required separately. Public executable
capsules remain `not_implemented`; the approved production execution boundary,
tenant dispatch and end-to-end field qualification remain open.
