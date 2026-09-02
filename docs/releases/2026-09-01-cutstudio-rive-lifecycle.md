# Rive preview lifecycle hardening

A Windows mobile browser run timed out waiting for Rive readiness while its
desktop counterpart and both portrait/export tests passed. A diagnostic repeat
passed on mobile and desktop, so the original intermittent cause is not proven.
Do not label a passing repeat alone as a root-cause fix.

Inspection of the pinned Rive runtime established that it emits `Load` before
finishing its playback queue and catches synchronous user `onLoad` errors only
in the console. Our previous nested animation-frame callbacks had no equivalent
error boundary and captured a potentially stale frame during asynchronous load.

The candidate adds one disposable preview controller: initialization is deferred
until the load callback returns, frame seeks read the latest time, every scheduled
callback is guarded, errors produce a visible failure rather than false loading,
and unmount/replacement cancels outstanding frames. Ten unit cases cover seeks
during load, initial playback/resize/pause/scrub/draw failures, decode failures,
and cancellation at all readiness stages. Browser qualification retains the
existing readiness deadline and actual nontransparent pixel assertion.

The Windows qualification harness now retains failed synthetic Playwright
evidence in the ignored `test-results` folder while still removing its temporary
database, uploads and runtime files. Rive readiness failures attach browser
errors. These diagnostics do not establish production closure or general Rive
state-machine/interactive-media parity.
