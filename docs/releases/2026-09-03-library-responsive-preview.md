# Library preview: long filenames on narrow screens

Review of the retained real mobile playback image exposed horizontal overflow:
the implicit single grid column used the long filename's intrinsic width, pushing
the player and asset actions beyond the viewport. Playback assertions had passed
but did not prove that all controls were on screen.

Use an explicit zero-minimum single grid column below the existing desktop
breakpoint, retaining the desktop three-column layout. Existing public/private
real playback cases now assert that search, video and Remove asset controls fit
inside the viewport and retain the exact measured bounds in their JSON receipts.
The prior image remains evidence; this is not a reason to weaken existing tests.

Source image reviewed: the private mobile library-video.png under
`B:/CreatorOS-library-adaptive-preview/test-results/creativesos-browser-qualification-3ffc4d90d1d64af6ad158fb9b43374e7/`.
The prior protected 396-browser and local 16-browser checks passed their narrower
playback/race scope. New layout qualification, protected checks and deployment
are pending. This is a responsive-layout correction, not a complete Stitch or
Remotion parity claim.
