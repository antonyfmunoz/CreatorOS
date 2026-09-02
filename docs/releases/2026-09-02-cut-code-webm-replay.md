# WebM reproducible-container qualification

Status: locally qualified isolated prototype; protected CI and production
execution approval remain separate gates. No public executable-code release.

Comparing the same owned encoding fixture between local and protected-CI runs
revealed equal decoded pixels but 16 differing WebM container bytes. A new
within-run replay assertion reproduced the failure against the old image. The
silent VP9 mux and the final VP9/Opus mux now use FFmpeg's output `fflags bitexact`
option. No codec quality, frame timing, alpha or isolation limits were relaxed.

On 2026-09-02, all 39 runtime unit/type tests and the complete artifact/isolation
suite passed in both the normal and lean candidate images. The suite now
independently rerenders CRF 8/48 noise fixtures, transparent motion, and transparent
motion with an Opus soundtrack, asserting identical full artifact bytes. Existing
decoded-pixel, alpha, audio, frame-count, timeout, cancellation and no-network
assertions remain active.

| Owned output | Bytes | SHA-256 in both images |
| --- | ---: | --- |
| VP9 CRF 8 | 17,375 | `4b3ab1e6d9c39b5195b8853299b310dfef0f7c7ec49d0e832bb116780a72f5ac` |
| VP9 CRF 48 | 8,707 | `688835f4d0d23b1fa41c838e3438c369f26cb030bf5461a5fa960baf462ddf26` |
| Silent alpha motion | 1,190 | `7397410721e57c0bd558928881b5777a3755b180314b2a061d1ba7b7ff9e810c` |

Normal image: `sha256:089575d7475f9db75664f670d3dca0aad9748b7af5d0d5e676d7f823321d8a2c`.
Candidate: `sha256:d53c960ff21798e4ad4660900eb020231d9ae69635f3153263720fc3f9cfeae5`.
The candidate's fresh Trivy 0.74.0 scan found zero HIGH/CRITICAL vulnerabilities;
there are no new ignore rules or severity changes.

Evidence is retained under `B:/CreativesOS-task-artifacts/`: the failing
`webm-replay-baseline.log`, passing `webm-replay-unit.log`,
`webm-replay-isolated.log`, `webm-replay-candidate-isolated.log`, and
`webm-replay-candidate-vulnerabilities.json`. The older encoding receipt's file
sizes describe its earlier containers; this change intentionally removes variable
metadata and produces smaller containers without changing the decoded fixture.

This is replay evidence for deterministic owned capsules and pinned media tools,
not a promise that arbitrary dates, randomness, asynchronous source code, other
encoder versions or every codec will produce identical bytes. It is not a broad
Remotion parity or production security claim.

Reference: [FFmpeg format options](https://ffmpeg.org/ffmpeg-formats.html), output
`bitexact` semantics. No competitor source or package was copied.
