# Composition loading synchronization

The native composition player now holds its frame clock while mounted private
images, fonts, audio/video, Lottie or Rive resources prepare. All mounted resources
must be ready. A stale completion from a replaced asset cannot unlock a new one.
Paused intent survives loading, seeking and retry; resumed playback does not
consume wall time spent waiting. Seek preparation and media waiting events hold
the shared clock and stop other media. A layer beyond its source duration holds
the final sample instead of restarting its media element.

Unavailable resources present visible failure/retry, with a bounded 30-second
readiness watchdog. Replacing an asset or retrying remounts the relevant resources;
old loads, registrations and audio connections are cleaned up. This is not a
claim of frame-perfect final composition/export parity, all-browser coverage,
offline recovery or a public executable-TSX player.

## Local evidence

- Four readiness-state unit tests cover overlapping leases, stale completion,
  independent errors, timeout, cleanup and stable snapshots.
- Initial app qualification passed all 599 tests, types, build, bundle budgets
  and the Worker dry-run; no Worker was deployed by that dry-run.
- Initial browser pass: 18 tests across mobile and desktop Chromium, including
  actual private media, measured post-gain sound, slow response gates, frozen
  frames, resume, retry, user pause and source-tail behavior.
- Expanded pass: **26 passed, 6.7 minutes**, with delayed actual private fonts,
  Lottie and Rive plus both existing native typography and full programmable-cinema
  editing/rendering journeys. No local retries were enabled. Retained logs:
  `B:/CreativesOS-task-artifacts/cut-preview-buffering-expanded.log` and its
  `-error.log` companion.

The native encoder-progress change is combined only after this isolated preview
pass; the combined source requires its own root and browser qualification.
Protected merge and production deployment are not yet claimed.

## Protected qualification structure

Protected run `33637334398` ended with 281 passed, 24 existing skips and one
programmable-cinema test that passed on retry. Its missing first-attempt progress
is an open diagnostic gap, not a proven fix. Reports and failed traces are now
retained even when retries make the overall run green.

The complete mobile and desktop suites run in independent jobs, each with its own
seeded database and the existing 30-minute bound. Their internal execution remains
serial. The required `Browser journeys` check succeeds only when the entire matrix
succeeds; failure, cancellation or skipping cannot pass it. Branch-protection
settings, test assertions, retry policy and individual test limits are unchanged.
