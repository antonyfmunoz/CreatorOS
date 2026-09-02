# Native code motion controls

The isolated prototype now supports independent frame-driven springs, easing,
cubic Bezier curves, numeric/color keyframes, keyed variation, global/local
frame access, freeze and finite/alternating repetition. The code is clean-room;
it does not promise source compatibility or direct parity with Remotion.

Local qualification: ten unit tests passed, dependency audit found zero known
vulnerabilities, and the actual Docker/Chromium/FFmpeg harness passed all render
and execution-boundary checks. The motion-specific PNG was decoded for exact
purple/green pixels and visually inspected. It exercises nested local frames,
preserved global frames, a frozen child, Bezier-positioned geometry and spring
output. A failing React effect rejects rendering rather than producing a blank
success. Existing TSX/module/input/transparency/video/network/metadata/file,
watchdog, cancellation and cleanup checks remain intact.

These are prototype results. Protected Linux qualification and code review are
separate release gates. The code runtime is not connected to public jobs, and
the normal application still reports executable compositions as unimplemented.
No provider infrastructure, privileges, secrets or spending limits were changed.
