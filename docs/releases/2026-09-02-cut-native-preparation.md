# Native preparation visibility and per-job browser reuse

Preparation used to remain at `Starting` while private graphic layers were
rasterized. The application now reports bounded layer/frame progress below the
encoder phase; private asset paths, fonts, title text and source names are not
included. The original completion deadlines remain unchanged.

Text and animation layers in one native job now lazily share its Chromium
process, but each layer retains a fresh isolated context. There is no global
browser pool, cross-job/tenant sharing, external request permission or public
code execution. Existing offline text routing and local-only animation routing
are unchanged. The job owns shutdown, including text timeout; animation closes
its context on success/error while leaving a borrowed browser to its owner.
Independent animation callers still close the browser they started themselves.

Four focused units passed: lazy/single launch, idempotent shutdown, pending launch
shutdown, failed launch cleanup and bounded progress. Actual text/font/animation
pixel equivalence, context cleanup, full root, repeated workflow, exact protected
and production proof remain pending. No claim is made that startup reuse alone
solves the retained cinema render deadlines or establishes Remotion parity.
