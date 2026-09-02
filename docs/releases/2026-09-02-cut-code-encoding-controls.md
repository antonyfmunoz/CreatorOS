# Private-code video encoding controls

Status: locally qualified prototype, not public code execution or Remotion parity.

H.264 MP4 and VP9 WebM requests can explicitly choose constant quality or target
bitrate and codec-specific encoder speed. Unknown, conflicting, out-of-range and
cross-codec options fail admission. Encoding uses fixed executable argument arrays,
not shell interpolation. Existing requests without controls retain their defaults.
Host receipts reject missing or changed quality/speed controls.

Local qualification on 2026-09-02:

- All 39 runtime unit/type tests passed.
- The complete isolated artifact, privacy, timeout and cancellation suite passed.
- A deterministic owned 160x90 grayscale-noise composition with a moving marker
  rendered six frames at 30 FPS in both codecs. Independently decoded first-frame
  RGB mean squared error against the PNG reference and actual file sizes were:

| Codec | CRF | RGB MSE | Bytes |
| --- | ---: | ---: | ---: |
| H.264 | 8 | 1.7853 | 15,404 |
| H.264 | 48 | 3,707.1505 | 1,786 |
| VP9 | 8 | 0.7234 | 17,438 |
| VP9 | 48 | 35.4566 | 8,770 |

Every artifact was independently probed for codec, 160x90 dimensions, six frames
and 0.2-second duration. The separate 1000-kbit/s target / veryfast MP4 decoded
and retained its exact requested settings in the host-verified receipt. That
short fixture does not prove a constant bitrate or sustained throughput.

Artifacts and receipts: `runtimes/cut-code/qualification-output/`; retained logs:
`B:/CreativesOS-task-artifacts/encoding-unit.log`, `encoding-image-2.log`, and
`encoding-isolated.log`. The updated lean candidate also passed the full isolated
suite and a fresh Trivy 0.74.0 scan with zero HIGH/CRITICAL findings; logs and JSON
are `encoding-candidate-isolated.log` and `encoding-candidate-vulnerabilities.json`
in the same retained directory. No findings were ignored or severity gates
changed. Protected CI remains a separate gate. No live application release or
production-isolation approval is claimed by these prototype tests.

This does not implement H.265/AV1/VP8, two-pass encoding, hardware encoding, HDR,
lossless RGB, CRF/bitrate equivalence across codecs, or representative Remotion
benchmarks. The browser capture remains 8-bit SDR. Resource caps are unchanged.

Behavior references: [Remotion encoding](https://www.remotion.dev/docs/encoding)
and [FFmpeg libx264](https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb).
No Remotion package or source was copied.
