# CutStudio animated 3D and flip rendering

CutStudio now carries time-varying X/Y rotation and perspective from the same
declarative composition evaluator used by the browser preview into the final
private FFmpeg artifact. A flip entrance is no longer flattened to the layer's
settled transform.

## Implementation

- Normal users can keyframe `rotationX`, `rotationY`, and `perspective` from the
  visual composition editor.
- Compilation samples those properties together with transition state and
  retains the exact evaluated values in EDL v3 graphic motion points.
- The renderer projects each sampled raster graphic into a bounded
  quadrilateral and assigns mutually exclusive frame intervals, preventing two
  adjacent perspective transforms from applying at one boundary frame.
- Shape, path, sanitized SVG, text, caption, lower-third, and private image
  layers inherit the same path without a browser runtime or network access.

## Evidence

- Focused programmable-runtime tests cover flip evaluation and sampled 3D
  compilation.
- Fresh mobile and desktop browser qualifications each start an isolated
  database at all 116 migrations, author the flip through the UI, render the
  private MP4, and compare an edge-on frame with the settled transformed layer
  at exact pixels.
- The existing motion, vector, image, title, filter, authorization, variant,
  workflow, and tenant-isolation assertions continue through the same journey.

## Honest boundary

This closes animated raster 3D and flip final rendering. It does not claim
geometric mask export, the remaining stylized effects, native Lottie/Rive/Three
playback, isolated executable compositions, model quality, or direct
competitive benchmark parity.
