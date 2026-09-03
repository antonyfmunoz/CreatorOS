# Exact-byte validation at the native animation boundary

Library admission already rejects unsafe Lottie data and invalid Rive headers.
The native renderer previously trusted that earlier path: it reopened source
files, parsed Lottie without repeating the policy, and loaded the expression-
capable SVG player. Composition asset checks establish ownership/readiness/type,
not a fresh byte-validation receipt. This change does not claim an observed
exploit; it removes that reliance at the point of rendering.

The renderer now opens and stats one source handle, reads only its bounded size
plus one growth-detection byte, rejects truncation/growth, and validates the exact
buffer before launching any browser. It repeats the existing Lottie expression,
resource, nesting, node, duration and shape policy and the existing Rive header/
size policy. Preparation consumes only that validated in-memory source, not a
second path read. No policy limit is increased.

Native Lottie uses the same non-expression SVG player family as authoring preview,
with expression evaluation explicitly off. Unsupported expression files fail;
they are not silently changed. Animation contexts are offline, refuse downloads
and service workers, deny context-wide HTTP requests and close WebSocket routes.
Only the exact trusted page-level Rive WASM fulfillment is permitted. Existing
render assertions and native context/process cleanup remain required.

Focused tests cover actual safe/unsafe files, no browser launch on rejection,
size changes, Rive header checks, network-denial configuration and absence of
an eval call in the installed light player. The actual native pixel-reuse journey
also rejects an expression-bearing source and retains its healthy job browser.
The 14 focused source/animation/Lottie tests passed locally. Non-incremental
types, complete root tests, real Rive/Lottie browser output, protected CI and
deployment are still pending for this exact change.

The existing protected animation qualifier now always renders the repository's
Rive fixture as well as Lottie. Previously Rive required an optional CLI argument,
so the default gate did not exercise its WASM fulfillment. Each Rive frame must
contain visible artwork, not just a valid empty PNG. Explicit private fixture
arguments remain supported. No prior animation assertion is removed.

Context/page route precedence and socket interception follow the Playwright API:
https://playwright.dev/docs/api/class-browsercontext#browser-context-route
https://playwright.dev/docs/api/class-browsercontext#browser-context-route-web-socket

This is native data-only rendering. It does not enable uploaded TSX, approve a
public execution topology, establish an OS isolation guarantee, or prove Remotion
parity.
