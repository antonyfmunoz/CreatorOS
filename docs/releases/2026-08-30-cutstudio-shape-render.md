# CutStudio final-render shapes

Date: 2026-08-30

## Outcome

Filled shape layers authored in a declarative composition now survive the
editable EDL boundary and render into the final private video artifact.

## Product behavior

- The EDL graphic contract recognizes a bounded `shape` kind with normalized
  width and height.
- Composition compilation preserves timing, geometry, fill color and opacity.
- The timeline monitor presents applied shapes with the same normalized frame
  geometry.
- The native FFmpeg graph renders the bounded fill only during its scheduled
  interval without introducing executable code or network access.

## Qualification

- Focused runtime and EDL regression tests pass, including exact shape
  geometry, color, opacity and timing.
- Fresh mobile and desktop 115-migration field journeys render a real private
  720p artifact and decode an exact frame.
- Pixel evidence inside the scheduled shape proves the expected blue-channel
  ordering after alpha compositing, while the existing title-motion evidence,
  variants, workflows, reviewer authority and tenant denials continue to pass.

## Remaining boundary

Shape motion, rounded geometry, strokes, general SVG/path rasterization,
rotation and interactive-media renderers remain separate final-render work.
