# Lean Noble executable-renderer candidate

This candidate is not a public executable-capsule deployment or a Remotion parity
claim. It keeps the exact pinned Playwright/Chromium rendering parent and removes
unused runtime components rather than suppressing scan results.

## Local evidence, 2026-09-02

- Qualified parent image:
  `sha256:f20d8b6fe224a64152609b958e76e48d95f8ae358d5aef87104c9e6fb90cb132`.
- Stripped candidate image:
  `sha256:28e73ed8d89a672b25d503e6b51bc2c6e420398ed261b9096ecb94ca8d547035`.
- Trivy 0.74.0, current vulnerability database, OS and installed Node packages,
  HIGH/CRITICAL gate: parent 11 findings (1 critical, 10 high); candidate **0**.
  A zero finding count is this scan's observation, not a security guarantee.
- Removed global npm/npx, which is only needed while building; removed two
  optional GStreamer bad-plugin packages and unused Firefox/WebKit engines.
  Chromium, FFmpeg, application dependencies and their package metadata remain.
  No ignore list, unfixed-vulnerability waiver or lower severity threshold.
- The full isolated suite passed against the candidate's immutable image ID:
  ProRes/PCM, GIF, audio-only, MP4, VP9 alpha/Opus, stills and sequences, private
  CSS/fonts/media, Three SVG, motion timing, asynchronous failures, denied
  network/metadata/local-file access, timeout, cancellation and container cleanup.
- Source installation and image build happen before execution. Capsules still
  cannot install packages or obtain runtime credentials/network access.

Evidence is retained in `B:/CreativesOS-task-artifacts/` as
`noble-runtime-vulnerabilities.json`, `noble-candidate-vulnerabilities.json`,
`noble-candidate-image.log`, `noble-candidate-isolated.log` and
`noble-candidate-scan.log`; actual artifacts/receipts are in
`runtimes/cut-code/qualification-output/production-candidate/`.

## Reproducibility and remaining gates

Protected candidate job [33614621889](https://github.com/antonyfmunoz/CreatorOS/actions/runs/33614621889)
at source `2a077b69f8b4d3944e922cedd52c4190d09cd902` passed both the complete
isolated artifact suite and the independent zero HIGH/CRITICAL OS/Node scan.
Downloaded evidence is retained in
`B:/CreativesOS-task-artifacts/noble-ci-33614621889/`.
Independent local inspection of its ProRes 4444 MOV confirms six 128x72 frames,
0.2-second video, alpha-bearing decoded format, stereo 48-kHz PCM16 and 9,600
audio samples. Its SHA-256 matches the local candidate byte-for-byte:
`820b49a7c611c1135e0c62ac7227eb719f34d0abfc5e6683476a057d6287e769`.
GIF, WAV and private-CSS PNG comparison samples also match byte-for-byte.
This is bounded cross-host reproducibility evidence, not general determinism,
public deployment, security approval or competitor equivalence.

The build caller creates a content-addressed local tag from the checked image ID
and verifies that mapping before and after the candidate build. Docker cannot use
a bare local image ID as a FROM reference. The parent Dockerfile and dependency
lockfiles remain pinned. The required parent argument has no floating default;
the resulting missing-default build warning is intentional fail-closed behavior.

The dedicated CI candidate job rebuilds the parent from this checkout, runs the
same actual artifact suite, then blocks on any HIGH/CRITICAL finding. Its scanner
download is checksum-pinned and it retains unsuccessful scans as well as passes.
Protected CI must reproduce this result before promotion. No production IAM,
service topology, credentials, branch protection or public capability was changed.

The older Trixie candidate remains an unsuccessful, unapproved experiment. This
Noble candidate does not authorize executing customer TSX inside the ordinary
credential-bearing GCP worker. Tenant admission, custody, dispatch, recovery,
approved isolation topology and public editor/player/render qualification remain.
