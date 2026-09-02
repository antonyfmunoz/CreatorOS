# Private-code ProRes artifact qualification

The isolated prototype now exports ProRes MOV in HQ, 4444 and 4444 XQ profiles.
HQ uses opaque 4:2:2; 4444/XQ encode transparency. Requested explicit audio is
uncompressed PCM16 at 48-kHz stereo. Existing bounded capture, processing and
artifact limits remain unchanged. This is not public executable code, approved
production isolation, HDR acquisition or certified external-editor compatibility.

Local 2026-09-02 evidence:

- All 36 runtime unit/type tests passed, including unsupported profiles,
  incompatible modes/options, dimensions, compute bounds and receipt tampering.
- The complete isolated suite passed with ProRes added ahead of the existing
  GIF, audio-only, MP4, WebM alpha, stills, sequences, CSS/fonts, media, Three,
  motion, privacy, timeout and cancellation checks.
- Independently decoded 128x72 MOVs contain exactly six frames from absolute
  composition frames 6..11 at 30 FPS (0.2 seconds). A moving opaque green marker
  stays at its expected position and color on every frame.
- 4444/XQ preserve transparent background and a half-opacity magenta patch;
  HQ remains opaque. FFprobe identifies the actual profile and stream type.
- Each requested soundtrack is PCM16, two channels, 48 kHz, and decodes to exactly
  9,600 mono analysis samples with audible RMS within the fixture's expected band.
- Identical 4444 requests replay byte-for-byte. A silent export contains no audio
  stream rather than a fabricated soundtrack.

Artifacts/receipts are in `runtimes/cut-code/qualification-output/`; local logs
are `prores-unit.log`, `prores-image.log`, and `prores-isolated.log` under
`B:/CreativesOS-task-artifacts`. Protected qualification remains required before
merge, and production code execution remains blocked by its independent gates.

The browser produces SDR 8-bit captures. A higher-precision codec does not turn
that into HDR or restore missing source precision; ProRes remains a lossy codec.
No claim is made of matching Remotion output, production scale, or playback in
Final Cut/Premiere without the corresponding comparative field evidence.

Behavior references: [FFmpeg ProRes encoder](https://ffmpeg.org/ffmpeg-codecs.html#ProRes)
and [Remotion encoding guide](https://www.remotion.dev/docs/encoding). No Remotion
package or source was copied.
