# Audible primary preview gain

The existing source-backed timeline monitor sent its audio directly to the
speaker output. Primary track gain/mute controls changed the export but not the
monitor. The monitor now routes its source through a native Web Audio gain node
before both output and the visible meters. Track gain, track mute, bus gain/mute,
clip gain and the native keyframe curve feed that node. It starts silent until
the current edit is evaluated, and is disconnected when the media element changes.

Shared automation points are used by FFmpeg export and monitoring rather than
maintaining a different initial/keyframe-override convention in each path.
Monitoring updates with the browser frame clock; it is not a sample-accurate
offline export and does not promise exact sub-millisecond coefficient identity.

Local evidence on 2026-09-02:

- Two shared gain-curve tests pass, covering constant gain, mute/bus values,
  zero-time overrides, eased/linear interpolation and final hold.
- Six mobile/desktop browser tests pass, including the new actual audible
  monitor and existing decoded output gain/mute and volume-automation journeys.
- In the real browser audio graph, quarter track gain lowers the displayed
  measured RMS by approximately 12 dB, mute reaches the noise floor, and unmute
  restores the prior level without reloading the media.
- The browser test reads measured meter output, not a gain data attribute or
  mocked audio node. `preview-mix-browser.log` is retained under
  `B:/CreativesOS-task-artifacts`.

Scope remains the current source-backed primary monitor. Full multi-source
timeline-clock playback, all overlay soundtracks, transition/fade monitoring,
master finishing and preview/export pixel equivalence still need implementation
and dedicated field evidence. This change does not claim those gaps are closed.
