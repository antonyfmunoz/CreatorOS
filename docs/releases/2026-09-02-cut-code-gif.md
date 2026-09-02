# CutStudio private-code GIF qualification

This is a separate isolated runtime capability, not public code execution or a
claim of Remotion parity. No provider, IAM, paid topology or production gate is
changed. The production executable-image vulnerability gate remains blocking.

Implemented `mode: video, format: gif` with optional bounded frame sampling and
repeat count, global palette construction, binary transparency and odd canvas
dimensions. Captured frames retain absolute composition time. The final sampled
frame's hold is shortened to preserve the selected range rather than extending
it to a whole sampling interval. GIF centisecond precision is explicit, not an
exact arbitrary-FPS promise. Audio is rejected rather than silently discarded.

Local qualification on 2026-09-02:

- All 34 runtime unit/type tests passed.
- Full isolated suite passed, including the existing media, alpha, audio-only,
  CSS/module, motion, 3D, network/file denial, timeout, cancellation and cleanup
  checks. Existing caps and deadlines were not relaxed.
- Actual 65x33 GIF artifacts at composition frames 3/6/9 decode to the expected
  moving green marker, fixed red patch and transparent background with no trails.
- Parsed binary GIF blocks show exactly three frames with 12/12/4-centisecond
  holds for a seven-frame range at 25 FPS. A 30-FPS version has 10/10/3 holds;
  a one-frame 50-FPS range has a 2-centisecond hold.
- Indefinite, play-once and two-repeat metadata are independently checked;
  FFprobe confirms a single GIF stream and 0.28-second sequence duration.
- Identical requests replay to byte-identical GIFs. Host receipts reject altered
  sampling/repeat metadata and bind actual encoded frame count.
- Soundtrack injection and excess palette memory requests fail admission.

Evidence: `runtimes/cut-code/qualification-output/`, including `sampled-*.gif`
and the aggregate receipt; local logs `gif-unit.log`, `gif-image.log`, and
`gif-isolated.log` under `B:/CreativesOS-task-artifacts`.

Protected CI must independently qualify the immutable candidate before merge.
The isolated runtime check subsequently passed in run
[`33610439488`](https://github.com/antonyfmunoz/CreatorOS/actions/runs/33610439488)
for candidate `3dcb74fa7f6a01a9d9dd09a9ca8e0a3479dcd06c`. Its retained
`sampled-infinite.gif` matches the local artifact exactly:
`04c5b84584ca65336e7272d3961ebc3aec8b4829c55e4b4ac714473bdf50a024`.
This proves that bounded GIF case across the two environments, not production
code execution or general cross-version deterministic encoding.

No Remotion source or package was imported. Public API behavior references:
[Remotion GIF rendering](https://www.remotion.dev/docs/render-as-gif) and
[FFmpeg GIF muxer timing](https://ffmpeg.org/ffmpeg-formats.html#gif-1).
