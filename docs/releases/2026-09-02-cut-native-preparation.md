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

Initial root source `90dfbcf` passed 668 tests across 159 files, types, build,
budgets and Worker dry-run. The actual pixel comparison matched all 12 frames
but failed its anti-vacuity assertion: the older shared Lottie fixture produced
only two unique frames. Its non-held keyframe omitted required easing handles.
Both synthetic rotation and cinema-position fixtures now include the explicit
linear i/o handles required by the [Lottie property specification](https://lottie.github.io/lottie-spec/latest/specs/properties/).
The stronger motion assertion remains unchanged. Original failure:
`native-session-20260902202848929`; `cut-preparation-native-20260902T132702.log`.
Full rerun is required; matching static output is not animation parity.

Corrected source `700315a` passed root (668 tests/159 files, types/build/budgets/
Worker) and the actual native session proof in 37.7 seconds: all 12 animation
frames and both font layouts matched independently launched renderers byte for
byte, more than six distinct frames were required, only one shared browser was
launched, and success/error contexts and final shutdown were checked.

Its ten-case browser suite retained nine passes and one mobile text failure:
the native screenshot exceeded its unchanged ten-second limit after fonts
loaded. Both cinema workflows, desktop text, proxy/multitrack and snapshot
workflows passed. Evidence: `creativesos-browser-qualification-40ffba65a748423cbda4ade89a086b17`,
`cut-preparation-browser-20260902T133049.log`, and
`native-session-20260902203258009` (see retained native receipt for exact path).
Later resource inspection observed only 1,318 MB free out of 16,235 MB, and an
owned single-input FFmpeg process using about 2,921 MB alongside the main render.
This observation does not establish the cause of the earlier screenshot failure;
it requires a measured repeat. No timeout or image tolerance is waived.
