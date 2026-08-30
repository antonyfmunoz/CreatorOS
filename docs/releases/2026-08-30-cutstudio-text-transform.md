# CutStudio text transform rendering

Date: 2026-08-30

## Outcome

Normal-user text, caption and lower-third layers now preserve sampled position,
opacity, scale and Z-rotation in the final private MP4. Final rendering no
longer stops at the browser preview for text transforms.

## Architecture and safety

- Text is rasterized server-side with the allowlisted installed production
  font and the existing bounded text/color/size schema.
- Raster titles use the same maximum-footprint scale and rotation graph as
  shapes and paths, preventing rotation clipping or anchor drift.
- No browser-supplied font path, filter expression, SVG markup, executable
  template, network authority or tenant secret reaches the renderer.

## Qualification contract

- Unit coverage proves rotation and sampled scale survive composition-to-EDL
  compilation.
- The authenticated mobile and desktop journey authors the title transform,
  renders the real private artifact and compares blue-title pixel population
  across exact frames while retaining the existing translation proof.
- Full repository verification, secret scanning, protected CI, exact-release
  deployment identity and production smoke remain mandatory before this is a
  production-qualified capability.

## Remaining boundary

Static X/Y rotation and perspective are completed by the subsequent bounded
3D slice. Animated 3D/flip, advanced transitions/effects, sanitized general
SVG and interactive image/font/Lottie/Rive/Three rendering remain separate.
