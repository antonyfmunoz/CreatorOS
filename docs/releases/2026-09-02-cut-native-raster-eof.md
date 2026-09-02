# Finite raster inputs and render-failure isolation

PR 155's first protected Verify run, `33657761391`, failed the mobile cinematic
render at its existing 60-second job deadline. The original and retry both
stalled at frame 40 / 1.94 output seconds. Five subsequent checks then hit the
shared fixture actor's two-job admission cap. Desktop, core, database and native
mobile build checks passed, but this was not a qualified release.

The candidate now gives every generated raster input a finite input duration,
rounded upward to a whole delivery frame. The independent output duration stays
unchanged. Still PNGs continue to loop for that finite interval; animated inputs
also receive the finite bound. No encoder deadline or admission cap is raised.
This bounds source EOF and is a candidate correction, not yet proof of the exact
Linux stall's cause or resolution.

The failed-render test helper records the original state evidence and then uses
the normal authenticated API to cancel only its own fixture job. It rethrows the
original failure. A failed test must not leave an active job blocking independent
later tests; neither cleanup nor a retry counts as a passing original run.

## Local native evidence

- Three duration-helper unit tests passed.
- `cut-studio-raster-eof.spec.ts` passed independently on Windows. The input alone
  terminates after 48 RGBA frames at 24 fps / two seconds, with no output duration,
  frame-count or shortest-stream guard.
- Delayed dynamic-alpha overlays encode complete two-second artifacts at 24, 30
  and 60 fps: 48, 60 and 120 frames. The actual final frame was decoded and its
  foreground checked in each artifact.
- Retained evidence:
  `B:/CreativesOS-task-artifacts/native-raster-eof-20260902T1719`.

Exact integrated root/browser, Linux protected-CI and subsequent production
worker/artifact qualification are still required. This does not establish broad
decoder, long-media or competitive parity.

## Combined candidate and Linux compatibility correction

Candidate `f097e5ae3d0088c71c8da2c09566218de3f1c64e` passed local root
qualification (644 tests / 154 files, types, build, budgets, Worker dry-run) and
all 16 combined browser/native checks, with retained actual artifacts under
`B:/CreatorOS-cut-parity-integrated/test-results/creativesos-browser-qualification-d2ce7f5bcd61422b9afbbc719d90d392`.

Protected Verify `33661183679` nevertheless failed. Its desktop job recorded 21
failures, 128 passes and 24 existing skips. Newer pinned Linux FFmpeg explicitly
reported `Unrecognized option 'filter_complex_script'`; local Windows FFmpeg
8.1 still accepted that former option. CodeQL and the core/database/native build
jobs passed, but this candidate is not mergeable or deployable.

The generated graph writer now uses documented `-/filter_complex` file-argument
syntax, preserving the private UTF-8 file, exclusive creation, 8 MiB cap and job
cleanup. Three helper tests and an actual native three-frame RGBA test passed;
the latter uses a path containing spaces and Unicode and requires exact bytes.
Evidence: `B:/CreativesOS-task-artifacts/native-filter-file-20260902`.
Corrected full root, Linux checks and production remain pending. Since the
rejected option prevented those Linux renders from starting, the finite-input
correction's original Linux EOF claim remains unproven as well.

Reference: [FFmpeg file-argument options](https://ffmpeg.org/ffmpeg.html#Options).

## Cross-version and fixture-rate correction

The supported-prefix candidate `bc9e27be24d271b36d4391cbe3e28a87dab4b892`
passed its 647-test local root suite. Protected run `33664284589` passed desktop,
core, database, Android, iOS and CodeQL. Mobile had 173 passes and one failure:
the final vector-framing fixture exhausted the shared actor's normal still-image
quota after preceding image tests. Both the original and retry returned HTTP 429;
neither failed rendering. The previously stalled cinematic render passed on both
devices in this Linux run. The candidate still did not qualify as a whole.

Pixel-only geometry, motion, image-fit and vector-gutter studies now download one
real private MP4 and decode their selected frames locally. Every existing pixel
assertion remains. Dedicated still-export format, bounds, authorization and
quota coverage is unchanged, as is the production rate limit.

The deployed Bookworm worker also has an older FFmpeg CLI than current CI.
Before writing a graph, the worker now inspects its own bounded full-help output
once per process. An advertised legacy file option is used on older engines;
the supported slash-prefix option is selected after the legacy option's removal.
Unrecognized help fails closed and a failed probe can retry; no media-engine
downgrade or command-line-size fallback is introduced. Five focused helper
tests and the local actual-output test passed. Production's exact older image
and the corrected combined candidate still require independent qualification.
