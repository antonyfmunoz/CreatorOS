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
