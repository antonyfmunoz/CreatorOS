# Native layer cleanup must reach its process owner

The combined predecessor `fff1b87a` passed protected Verify `33713565464`
(745 root tests, 378 browser journeys, 24 existing desktop skips, no retry
markers) and CodeQL. Its separate Windows run passed root/types/build/bundle,
scheduler checks and real owned-process shutdown, but retained native journey
timeouts: 9 of 12 local browser journeys passed; both native-session cases and
the mobile cinematic batch case exceeded unchanged limits. Both native wrapped
text cases, both text fitting cases, all four workspace cases and desktop
cinematic workflow passed. Both workspace screenshots were inspected. Those
failures are not reclassified by CI or by this follow-up.

Code review found a separate lifecycle hole: native text and animation both
awaited `context.close()` before reaching their browser owner's cleanup. A stuck
context could prevent that safeguard from running; rejected context close was
also silently swallowed after capture. This is not proof that every retained
Windows failure had that cause.

Each layer now gives context closure five seconds, then closes its exact job
owner and waits for process reaping. The layer fails rather than publishing
captured output or reusing an uncertain browser. Healthy contexts still close
independently while their job's browser remains reusable. Late transport
responses are handled. Failed owner cleanup is not suppressed. Text's existing
30-second deadline remains active through context cleanup. Its 10-second capture
deadline, frame/pixel limits, isolation and all browser assertions are unchanged.

The real-process qualifier now withholds a real context's close acknowledgement
and its owner's graceful shutdown, verifies forced reaping of that exact child,
and proves another owned browser remains usable. It never touches user browsers.

The follow-up passed 27 focused tests and non-incremental TypeScript checks.
Full exact-source qualification and deployment are pending. No executable user source is enabled;
this is the existing native data-only renderer, not a public code sandbox or a
Remotion-parity claim.
