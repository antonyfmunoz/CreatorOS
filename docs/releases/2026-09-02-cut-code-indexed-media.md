# CutStudio indexed media: candidate qualification checkpoint

This is isolated-runtime evidence, not a public-code deployment or a Remotion
parity verdict. Candidate implementation is in PR 161. No Remotion source is used.

## Changes

- Imported MP4/WebM frame selection uses bounded, strictly ordered integer
  presentation timestamps. A selected frame is decoded inside the existing
  no-network container and transferred as a private PNG to the browser canvas.
  A `seeked` event no longer stands in for evidence of the displayed video frame.
- Sparse VFR final-frame duration, H.264 reordered frames, VP9 transparency and
  container origins are covered by actual fixtures. An absolute-seek hint avoids
  decoding an entire source; exact timestamp selection remains authoritative.
  `-noaccurate_seek` avoids a second timestamp trim discarding the selected frame.
- Automatic imported-video sound keeps container-relative delayed onset and EOF.
  FFmpeg already subtracts the container origin; adding it a second time was
  diagnosed and corrected. Integer-tick subtraction also avoids a spurious
  fractional-loop duration caused by floating-point cancellation.
- The existing audio-preview regression now first waits for its actual decoded
  fixture's unity level. The quarter-gain tolerance and deadline are unchanged;
  starting the comparison during audio startup was a demonstrated test defect.

## Retained evidence and failures

Evidence directories below are local artifacts under
`B:/CreativesOS-task-artifacts`; they are not tracked customer data.

| Check | Result and scope |
| --- | --- |
| Earlier protected runtime `33689973303`, source `2e2b074` | Both images passed 77 records and the candidate scan had zero HIGH/CRITICAL findings. This does not qualify the newer decoder. |
| Earlier application run `33689973329` | Passed overall with one mobile preview-audio retry. Retained original trace showed an unsettled baseline; it is not a no-retry receipt. |
| `video-retime-study-20260902231110241` | The original 120-frame retime/repeat pixel failure passed with timestamp-indexed selection. |
| `indexed-video-20260902231423371` | Actual sparse VFR/B-frame output, independent still matching, VP9 alpha and the then-current source-audio suite passed. |
| `nonzero-clock-20260902232012097` / `nonzero-clock-20260902232125238` | Original host audio output was silent; corrected relative-origin output measured zero before/after and about .088 RMS during the tone. Host-only diagnostic, not a full-container verdict. |
| `indexed-frame-diagnostic-FIYMZH` / `indexed-frame-diagnostic-QhbCv7` | Original nonzero-origin frame decode failed; after correcting double seek trimming, all 60 selected frames across two loops decoded. Owned direct decoder diagnostic, not complete application proof. |
| `video-source-full-20260902232230434`, source `7a170ed` | Full run failed on nonzero-origin video selection. Failure retained; fixed in `b5b8eeb`. |
| `video-source-full-20260902233341671`, source `b5b8eeb` | 74 runtime units, package audit, both preliminary audio checks and image build passed. Isolated output checks progressed through source audio (including nonzero origin), VFR/alpha, encoding and replay. **Full qualification failed** on the existing 15-second Docker create control-command timeout; candidate suite and scan were not reached. The named temporary container was absent afterwards. Cause remains unconfirmed. |

The failed-run output snapshot may include previous generated files. Only
explicit run receipts/logs establish which checks ran; directory contents alone
are not evidence of a fresh pass. No assertions, control deadlines, isolation
limits or vulnerability thresholds were relaxed. Existing protected Linux
runtime and application gates must qualify the new exact head before merge.

Protected run `33697314506` then failed **both** images at the existing imported
transparent-overlay pixel assertion: black instead of the blue backing scene.
The retained exported WebM had `ALPHA_MODE: "1"`; the new decoder checked only
lowercase `alpha_mode`, selecting a decoder that discarded alpha. A focused
metadata test reproduced the error. Tag-name matching is now case-insensitive
while its enabled value remains exact; the actual overlay assertions are
unchanged, and the reimported PNG is retained even when they fail. This correction
still requires the new complete protected image suites and scan.

## Remaining boundaries

Eight imports, 36,000 indexed frames/source, 20 MiB/import, 120-second sources,
4K pixel area, 64 MiB decode cache and the existing per-job caps remain. Audible
video speed is .5–2; repeat sound still requires frame-aligned source periods,
speed and phase in this candidate. Fractional-period loop work is separate and
is not qualified by these receipts. Arbitrary decoders, reverse audio, long
workloads, hardware/3D and public editor/player/service remain open.

The ordinary credential-bearing GCP worker is not an executable-code sandbox.
Public source execution remains `not_implemented` pending an approved separate
execution boundary and end-to-end qualification. Same-input current Remotion
tests and human quality review remain required for competitive parity.
