# Native CutStudio owned-process cleanup candidate

The frozen `2edd9382` preparation-diagnostics run passed 17 local focused tests,
types, 737 protected root tests and 374 protected browser journeys (24 existing
desktop skips, no retries). The separate local native browser run retained
**two passes and four failures**. Fixed-label diagnostics recorded browser session
cleanup at 84,239 ms and 39,020 ms after completed image capture. Those failures
remain evidence; they are not converted into passes by a different CI result.

This candidate gives each native job an explicit Playwright BrowserServer owner.
Its control endpoint binds only `127.0.0.1`, uses an ephemeral port and a random
256-bit path, is never returned by an app API, and is never logged or persisted.
Browser environments contain only an OS/font allowlist, not application,
database, payment or provider secrets. Existing per-title offline contexts,
blocked service workers, image limits and capture deadlines are unchanged.

Cleanup gives graceful shutdown five seconds, then calls that exact owner's
supported `kill()` and awaits process reaping. A failed forced cleanup propagates;
it is not a successful render. This bounds the graceful phase, not an unconditional
wall-clock guarantee under OS starvation. It does not search for or kill browser
processes by name, restart Docker, or touch user applications.

Unit tests cover delayed/rejected close, idempotence, awaited reaping, late
rejection, failed kill, private loopback configuration, environment filtering,
failed connection and session reuse denial. A real-process protected qualifier
forces one owned browser down while checking a second remains usable, inspects
the actual child exit status, and closes the healthy browser normally.

Qualification, image promotion and production evidence are pending. Local
heavy qualification remains sequential. This is the existing data-only native
renderer, **not** permission to run uploaded TSX in the credentialed app/worker,
a new public execution service, or a Remotion-parity claim. Public source
execution/player, isolated topology, wider media/3D/scale and current authorized
same-input competitor benchmarks remain open.

## Retained first-candidate evidence

Head `2fef03c8` passed protected Verify `33712145577`: 745 root tests and 374
browser journeys, 24 existing desktop skips, no retry markers; CodeQL passed.
The real protected process qualifier reaped the deliberately stalled browser in
5,020 ms and proved another browser remained usable. Local focused tests passed
25/25, but the first local lifecycle run failed its unchanged ten-second screenshot
deadline before exercising the forced-kill case. That failure remains open.

Two bounded local diagnostic sweeps subsequently captured 320x180 and 80x40
images with installed Chrome 152, bundled full Chrome 151 and bundled headless
Chrome 151. All six captures and owned cleanups completed; they do not disprove
the retained intermittent capture failure or prove a version mismatch. No browser
selection, quality threshold or deadline is changed on that basis.

The integrated candidate also contains the independently tested expanded source
workspace and its newly strengthened mobile focus-visibility assertion. Its
combined source requires fresh protected/local qualification and actual public
field evidence. Connection failures now report a fixed message, not a private
browser control URL.

The supported lifecycle API contract is documented by Playwright at
https://playwright.dev/docs/api/class-browserserver and
https://playwright.dev/docs/api/class-browsertype#browser-type-launch-server.
