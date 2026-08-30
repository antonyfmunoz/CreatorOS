# CutStudio final-render raster graphic motion

Date: 2026-08-30

## Outcome

Shape and allowlisted path layers now share one private final-render pipeline
that preserves rounded geometry and applies sampled X, Y and opacity motion to
the actual artifact.

## Product behavior

- Shape fill and bounded corner radius are rasterized through Sharp.
- Path stroke/fill uses the same inert raster boundary.
- FFmpeg applies deterministic position expressions and per-frame alpha to the
  looped local raster during the layer's scheduled interval.
- Text graphics remain on the native drawtext path; no executable composition,
  browser renderer or network access is introduced.

## Qualification

- TypeScript and focused runtime tests pass.
- A fresh 115-migration mobile/desktop journey authors both opacity and X
  keyframes through the normal UI, renders a private 720p MP4 and decodes an
  exact settled frame.
- Pixel evidence proves blue fill at the moved shape location, absence at the
  vacated location and the white path stroke at its independently expected
  location; title motion, variants, workflows, reviewer authority and tenant
  denials continue to pass.

## Remaining boundary

Dynamic graphic scale, rotation, advanced transitions/effects, general SVG and
interactive-media renderers remain separate work.
