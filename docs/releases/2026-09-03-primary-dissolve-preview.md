# Primary cross-dissolve preview candidate

Extend primary sequence preview to the existing native cross-dissolve contract:
hold the preceding edited output frame while mixing the incoming source over
the first 350ms, capped at half either adjacent segment. A preceding gap is
black. Preserve already-applied outgoing fade opacity. Do not continue or replay
outgoing audio: native export pads it with silence and ramps incoming audio.

The player uses two private media elements only during the dissolve, waits for
the held frame, and never plays its outgoing soundtrack. Spans shorter than two
output frames beside a dissolve explicitly require a rendered preview. Titles,
layers, color/effects and other audio tracks still require a rendered preview.
No new export semantics or renderer image are introduced.

Four unit cases cover duration caps, held-frame/source clocks, incoming gain,
gap backgrounds and outgoing fades. Four desktop/mobile cases compare actual
blue-to-red or black-to-red preview pixels with native output and check held-
frame timing and playback through the boundary. Qualification is pending. This
is not full composition preview, native motion-graphics parity or Remotion parity.

## Retained local failure and corrective candidate

Protected Verify `33766634428` passed 849 root tests and 410 browser cases on
`a347d3be8752aec0b8f2f41a5542bfdc4baa6d50`, but the independent cold-cache local
run `cut-primary-dissolve-exact-20260903T073823` failed three of 16 cases.
Its traces are retained under `test-results/creativesos-browser-qualification-
e3ca67d2f66a4ab8aa87f6ee07399cfa` in the output-formats qualification checkout.

The first audio-preview page was still blank at its 45-second deadline, with
React optimized-module requests pending. Development startup previously launched
Vite warmup without awaiting its dependency commit. Startup now explicitly waits
for entry transforms, static-import crawl, dependency scanning and processing,
then verifies that the actual optimized files exist before listening. Four unit
cases exercise cold/cached/disabled optimization and failure propagation. The
existing 120-second server-start limit and 45-second functional limit remain.
This changes development readiness, not production bundle delivery.

Both contiguous-dissolve cases had already played to their final frame when the
test tried to click Pause. The candidate now checks the exact final frame, Play
control and paused media after natural completion. The 120-second case limit,
60-second render wait and per-channel pixel tolerance of 12 are unchanged.
The corrective candidate still requires a fresh full local and protected run;
green CI on the earlier head is not permission to overlook these failures.
