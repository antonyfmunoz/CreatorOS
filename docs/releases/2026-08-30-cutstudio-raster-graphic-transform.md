# CutStudio final-render raster graphic transforms

Date: 2026-08-30

## Outcome

Declarative shape and path layers now apply sampled scale and Z-rotation in
the final private artifact, completing their bounded 2D transform path.

## Product behavior

- Scale samples use the same bounded zoom pipeline already qualified for video
  overlays.
- The renderer computes the maximum scaled footprint and transparent rotation
  diagonal before encoding, preventing edge clipping.
- Overlay offsets compensate for the expanded raster footprint so authored
  X/Y remains logically stable.
- Shape fill is now directly editable in the normal-user authoring controls.

## Qualification

- Contract tests retain shape radius, rotation and sampled scale/position.
- A fresh mobile 115-migration journey authors fill, opacity, X, scale and
  rotation through the UI, renders a real 720p private artifact and preserves
  independently measurable title, shape and path pixels.
- Repository qualification covers the full suite, types, production build,
  bundle budgets and Worker dry-run before release.

## Remaining boundary

Text scale/rotation, 3D transforms, advanced effects/transitions, general SVG
and Lottie/Rive/Three final rendering remain separate work.
