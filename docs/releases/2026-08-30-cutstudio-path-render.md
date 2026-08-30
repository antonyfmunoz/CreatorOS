# CutStudio final-render vector paths

Date: 2026-08-30

## Outcome

Allowlisted inline vector paths authored in a declarative composition now
render into the final private CutStudio artifact instead of stopping at the
browser preview.

## Security boundary

- Path source accepts only bounded SVG path commands, numbers, separators and
  whitespace; tags, scripts, URLs, entities, CSS and external resources are
  rejected before persistence and again at the EDL boundary.
- The inert path is wrapped in a locally generated SVG and rasterized to a
  private temporary PNG through the existing Sharp runtime.
- FFmpeg receives only that local raster input. No browser execution, network
  access, arbitrary SVG document or executable composition is introduced.

## Qualification

- Contract tests preserve exact path data, timing, geometry, stroke, width,
  fill and opacity and reject active-content source.
- The Windows qualification runtime exposed that its FFmpeg build could demux
  but not directly decode SVG; the final implementation therefore uses the
  portable Sharp raster boundary rather than depending on host FFmpeg SVG
  support.
- A fresh mobile 115-migration field journey renders and decodes a real private
  720p artifact, then proves the white vector stroke at an exact expected
  pixel while retaining title-motion and shape evidence.

## Remaining boundary

General sanitized SVG documents, animated path geometry, vector motion,
rotation and advanced effects remain separate renderer work.
