# Primary preview uses the selected export clock

Candidate, not production proof. The primary sequence previously stepped and
played at a fixed 30 fps even when the render panel selected 24 or 60 fps. Pass
the current render rate into the player; its frame count, stepping, source seek,
playback clock and end frame now share that rate. Display the rate and frame
position. Changing it starts a new preview session, rather than reinterpreting
an old frame number under a new clock.

Four desktop/mobile cases select 24/60 fps through the normal render controls,
seek and step to exact source times, play to the final frame, and export through
the normal button. Independently decoded H.264 frame rate, frame count and one-
second duration must agree, with a cross-owner denial. Local and protected
qualification, deployment and production field evidence are separate gates.

This is primary-track timing, not a full layered compositor or Remotion parity.
It adds no new export control, provider, capacity or renderer-image requirement.
The existing 24/60-fps native paths are unchanged; unreleased 25/50-fps controls
retain their matching-worker-image activation gate.
