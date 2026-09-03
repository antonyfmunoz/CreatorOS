# Version-pinned native browser candidate for Windows

The installed Windows Chrome and bundled full-browser diagnostics retained both
45-second browser-reuse failures. A separate diagnostic on exact source `65bd39b`
using the already-installed Playwright headless shell passed all six journeys
in 3.9 minutes: actual source-rate/in-point/offset pixel equivalence, authoring
save/reload/preview/private-export geometry, and both text/animation browser-reuse
stress cases. Original timeouts and the earlier 10-second capture failure remain
retained; no test, capture or shutdown grace limit was increased.

This candidate lets the supported Playwright launch API choose its pinned
headless binary on Windows instead of selecting the user's independently updated
Chrome. The setup prerequisite is `npx playwright install chromium` (already part
of browser qualification). No browser is installed by application code. An
explicit `CUT_ANIMATION_CHROMIUM_PATH` still wins, but a broken explicit path now
fails with a fixed diagnostic rather than silently changing browser choice.
Production Linux keeps its existing system-browser search order.

This is a runtime-selection candidate, not proof that all Windows issues are
resolved. Full default-path lifecycle, Lottie/Rive, typography/fitting and browser
qualification remain required. The renderer is data-only; this does not activate
public TSX execution or establish Remotion parity. No user's open browser, policy,
profile or application is changed or closed.

Primary reference: [Playwright browser versions and headless modes](https://playwright.dev/docs/browsers#chromium-headless-shell).
