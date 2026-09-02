# CutStudio player controls

Status: locally field-qualified candidate; protected checks and deployment are
separate gates. This is not a Remotion-parity verdict.

The composition player now supports focused keyboard playback and frame seeking:
Space plays/pauses, left/right step one frame, Shift steps ten, and Home/End seek
to timeline boundaries. Stepping pauses playback. Native inputs, buttons, links
and editable fields retain their own keyboard behavior. Previous/next frame
buttons accompany the existing scrubber, volume and speed controls.

React callers can hold a typed player ref and play, pause, seek, read current
frame/play state, mute or change playback rate. Seek/rate values use the same
bounded functions as the visible controls; source code is not executed in the
application origin. This API controls declarative compositions, not the separate
experimental isolated TSX runtime.

On 2026-09-01, the complete programmable-motion/cinematic-production lifecycle
passed on mobile and desktop (2/2, 4.4 minutes) with the new stepping, clamping,
play/pause and existing media/output/authorization assertions. The test deadline
and existing qualification gates were not relaxed.

The same candidate passed all 550 unit tests, TypeScript checking, production
build, bundle budgets and the scheduler's type/dry-run checks locally. Protected
CI remains mandatory before merging.
