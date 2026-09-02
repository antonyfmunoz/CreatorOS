# Authored two-dimensional graphic geometry

The native composition compiler retains off-frame positions, authored graphic
dimensions and transform pivots instead of shrinking a layer to the remaining
canvas area. Optional EDL pivots preserve historical queued snapshot hashes.
The renderer scales real graphic content into a bounded transparent canvas,
rotates it, and places that canvas around the authored pivot. The legacy 3D path
is not represented as equivalent; unsupported non-centered 3D pivots fail before
graphic rasterization instead of silently producing a centered transformation.

Raster plans bound individual dimensions, pixel surfaces and aggregate planned
graphic surfaces before allocating them. This is not a measured peak-memory
guarantee, a media-overlay allocation budget or multi-tenant admission control.
Existing separate font and decoder limits still apply.

## Evidence and limits

- Five focused geometry/snapshot/budget/unsupported-3D-pivot tests passed.
- The owned one-second composition exercises a partly off-frame path, a rotating
  corner pivot and a top-right animated scale. Both mobile and desktop Chromium
  journeys passed in 3.1 minutes, without retries, against actual private native
  exports at frames 0, 10, 20 and 29.
- Each frame compared 1,159–1,209 solid-interior samples with a fixed per-channel
  tolerance of 8; antialiased boundary neighborhoods are excluded by the preview
  alone, not by whether output agrees. Foreground samples and a clipped-edge
  assertion prevent a blank-output pass. This is not full-frame pixel identity.
- Preview/export PNGs and comparison counts are retained under
  `test-results/creativesos-browser-qualification-db7bffcc82cb4512a2ad2c94d32642de`.
  The desktop frame-20 pair was also visually inspected. Log:
  `B:/CreativesOS-task-artifacts/cut-graphic-geometry-browser.log`.

The full combined regressions, protected source gates and deployment remain
pending. These simple solid-color 2D cases do not establish complex easing,
effect ordering, perspective, GPU, text-edge, long-media or Remotion parity.
