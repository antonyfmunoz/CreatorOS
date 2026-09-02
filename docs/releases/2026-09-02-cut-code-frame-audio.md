# Frame-authored soundtrack candidate

This change closes a bounded prototype gap: React compositions can author sound
alongside their scenes through the native `FrameAudio` component. It does not
enable executable capsules in the public application or establish Remotion parity.

## Contract and boundary

- Video requests opt in with `compositionAudio: true`; old request normalization
  and explicit soundtrack behavior remain unchanged.
- Private capsule-root WAV/MP3/FLAC/Ogg/MP4/WebM files, selected audio stream,
  local-frame offset, 0.5..2 pitch-preserving speed, per-frame numeric gain and mute.
- Nested scenes, conditional mounts and ordinary repeats contribute only their
  active intervals. Frozen frames and backward phases of alternating repeats
  are silent, not reverse playback. Each gain holds over its frame's samples.
- Trimmed exports retain the original local source and gain clocks. Explicit
  request tracks and discovered intervals share an eight-interval budget.
  A repeat/reset/remount/source change may consume another interval. At most
  600 frames and 120 seconds are admitted; other existing caps are unchanged.
- Audio descriptors are collected after frame preparation settles and validated
  again outside the browser. No callbacks, shell strings, remote URLs, provider
  access, microphone or credentials are introduced. Filter expressions contain
  normalized numbers only; larger bounded graphs use a fixed private file.
- The receipt binds the opt-in, interval count and normalized plan hash. Its
  hash is custody evidence, not an independent evaluation of arbitrary source.

## Local artifact evidence

Normal image: `sha256:4e8fd6fb784f23ccbaa233dfdc55a24f491ea175989879aacb4d88a95293ae4d`.
Fifty runtime unit/type tests passed at the initial checkpoint. The dedicated
isolated fixture passed actual PCM, AAC and Opus decode checks, quarter-volume
gain, source-frequency selection, pitch preservation, repeat, mute, silence,
range clocks, exact ranged MOV replay, missing/private-path/interval admission
and failure redaction. The 600-frame envelope passed without raising deadlines.

| Owned artifact | SHA-256 | Bytes |
| --- | --- | ---: |
| 48-frame scene soundtrack, PCM MOV | `5a30f4fa97b147353c50f6359e3e67c9940f3d3880c6b6aa9eda1908e769b3ba` | 322399 |
| Ranged PCM MOV, frames 9..20 | `cb5071f257fc596ede63f1907a4d23c1382c411c1953d1300890cf293c47f8c2` | 81519 |
| Ranged AAC MP4 | `7e111aa4583dad2682d03c44bdda201c54b603498fa181ab2480e87a1711553a` | 7846 |
| Ranged Opus WebM | `a536ea678633d9f8ee871ae6813d716da6602b5c90f8effc30e9d99b508af769` | 14503 |
| 600-frame/60-fps gain sequence, PCM MOV | `7f6f18632839c5e156eb10d18a7b1ba601434f00c1086c3e4b1e857b1f8e3a73` | 2033023 |

The scene fixture is 128x72; the maximum-envelope fixture is deliberately 16x16
to isolate audio processing. Neither is a full-HD throughput benchmark. The
decoded quarter/full RMS values were 0.0431961294 and 0.1726085589. These are
generated tones, not subjective soundtrack quality or competitor comparisons.

Evidence retained locally under
`B:\CreativesOS-task-artifacts\frame-audio-maximum\` and its companion log.
The subsequent normal-image full suite also passed, including prepared React
state, still-image behavior, existing CSS/3D/video/audio/alpha tests, denied network
and local-file reads, watchdog termination and cancellation cleanup. The same
fifty unit/type checks passed again. Candidate-image qualification, protected CI
and its fresh vulnerability gate remain separate requirements. No production
release is claimed here.

## Remaining

Public editor/player/dispatch, production isolation approval, preview sound,
automatic video-source sound, reverse audio, broader interval/media workloads,
and same-input competitor quality/time/cost comparisons remain. The ordinary
credential-bearing GCP worker must not execute capsules. Google management
reauthentication is still required for the separate pending native-worker release.

Reference: [Remotion audio authoring documentation](https://www.remotion.dev/docs/html5-audio)
was used to identify user jobs, not to copy its implementation. This is a native
clean-room API, not Remotion source/API compatibility.
