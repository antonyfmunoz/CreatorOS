# CutStudio geometric and private custom masks

CutStudio now preserves directional wipe, radial iris, clockwise or
counterclockwise clock, and private custom-mask transitions in final private
MP4 output. These transitions no longer stop at browser preview.

## Implementation

- Transition authoring exposes direction and, for custom masks, a ready private
  project-image selector.
- The shared evaluator samples reveal kind, direction, progress, and authorized
  mask identity into EDL v3.
- The renderer applies mutually exclusive, bounded alpha segments for wipe,
  iris, and clock reveals.
- Custom masks are resized to the layer, converted from luminance to alpha,
  applied before the existing transform graph, and animated through the same
  sampled transition opacity. A layer may not combine conflicting mask assets.
- Render materialization repeats owner/private/ready enforcement for both the
  graphic source and mask; a stale or cross-tenant mask fails closed.

## Evidence

- Focused schemas require a mask identity for custom-mask transitions and
  preserve half-progress transition state in the compiled graph.
- Fresh mobile and desktop journeys each start at all 116 migrations, upload a
  real half-black/half-white private mask, author all four transition families,
  render the private MP4, and prove hidden/revealed regions with exact pixels.
- Existing motion, 3D, image, text, vector, filter, variant, authorization, and
  workflow assertions remain in the same journey.

## Honest boundary

Remaining work includes the stylized effect families, font assets, native
Lottie/Rive/Three playback, isolated executable compositions, model providers,
and locked direct competitive benchmarks.
