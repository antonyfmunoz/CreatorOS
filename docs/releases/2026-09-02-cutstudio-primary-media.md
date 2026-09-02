# Native primary-track media custody

The pre-fix field test failed on both mobile and desktop: a primary-track hard
cut to a different private file still rendered the original source. The simple
render path was selected unless another track, graphics or a dissolve existed.

The correction routes distinct primary media through the existing owned-asset
multitrack path. It also fixes two adjacent native output defects:

- A silent primary clip no longer removes audio from every other primary clip.
  Exact-duration silence preserves offsets; audible clips are padded/trimmed to
  their visual duration after retiming, with existing gain and fade controls.
- Source-aspect multitrack exports use the original project's displayed geometry,
  including sample aspect and quarter-turn rotation, instead of forcing 16:9.
  Square-pixel output stays bounded and even-sized, matching ordinary source
  export's truncation policy. Explicit delivery/composition canvases are unchanged.

Local 2026-09-02 evidence:

- The retained baseline `primary-media-baseline.log` fails both viewports on the
  second clip's actual decoded color, not a mocked status or source string.
- Four geometry tests and TypeScript checking pass after the correction.
- All six focused browser tests pass: the new two-source export plus existing
  hard soundtrack gain/mute and cross-dissolve journeys, on mobile and desktop.
- The new actual MP4 has red then green frames, a 404x720 portrait canvas,
  approximately two seconds, silence in the first segment and audible 660-Hz
  source content in the second. Frame/audio data comes from the private rendered
  artifact route after the durable job completes. The helper's frequency is
  known from the synthetic input; RMS verifies audible output, not a spectral
  frequency match.
- Logs `primary-media-unit.log`, `primary-media-types.log`, and
  `primary-media-fixed.log` are retained under `B:/CreativesOS-task-artifacts`.

This does not close full timeline preview parity or arbitrary primary-track
gap/overlap positioning; those remain separate implementation/field-test work.
Exact protected release and production artifact proof remain required.
