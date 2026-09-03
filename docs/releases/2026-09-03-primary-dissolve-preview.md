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
