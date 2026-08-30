# CutStudio bounded 3D graphic transforms

Date: 2026-08-30

## Outcome

Normal users' text, caption, lower-third, shape and path layers now retain
static X rotation, Y rotation and perspective in the final private MP4. The
final renderer projects a real quadrilateral instead of silently flattening
the browser preview.

## Architecture and safety

- Composition X/Y rotation and perspective are normalized into EDL v3 with
  backwards-compatible defaults.
- The server computes bounded projected corners around the layer center and
  applies FFmpeg's cubic perspective transform before Z rotation and overlay.
- Browser filter expressions, scripts, markup, URLs and arbitrary render
  options are never accepted.

## Qualification contract

- Unit coverage proves X/Y rotation and perspective survive composition
  compilation.
- A fresh authenticated mobile and desktop journey authors all three values,
  renders the real private artifact, and proves the magenta card has a
  perspective-distorted row profile that a flat rectangle cannot produce.
- Full repository verification, secret scanning, protected CI, exact-release
  identity and production smoke remain required for production qualification.

## Remaining boundary

Sampled blur/brightness/saturation is completed by the subsequent bounded
filter slice. Animated 3D/flip, geometric masks, remaining effects, sanitized
general SVG and image/font/Lottie/Rive/Three rendering remain separate work.
