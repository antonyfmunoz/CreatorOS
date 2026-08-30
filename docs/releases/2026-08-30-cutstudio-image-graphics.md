# CutStudio private image graphics

Date: 2026-08-30

## Outcome

Creators can upload private still images into a CutStudio project, select them
as composition layers, transform them with the shared graphic graph and retain
their exact content in the final private MP4.

## Architecture and safety

- Migration `0115_cut_studio_image_media.sql` extends the constrained project
  media vocabulary to `image` without permitting image-only primary projects.
- Both direct upload and bounded proxy fallback retain private visibility.
  Project registration verifies ownership, ready state and image MIME type.
- Composition create/update reuses business-private asset authorization. The
  final renderer independently requires the project owner's ready private
  asset before local materialization and Sharp decoding.
- The EDL stores only the private asset UUID; it never accepts a client path or
  external URL. FFmpeg receives a server-created PNG in the existing bounded
  graphic graph.

## Qualification contract

- The migration ledger applies 116 migrations with `0115` as the exact latest
  migration.
- Unit coverage proves the image asset identity survives declarative
  compilation and missing assets fail validation.
- Fresh Pixel 7 and desktop Chromium journeys upload a real private PNG,
  register and select it through normal controls, save/apply the composition,
  render and download the private MP4, and prove exact magenta pixels in the
  exported frame.
- Full repository verification, secret scan, protected CI, exact release
  identity and production smoke remain mandatory.

## Remaining boundary

Private font selection and native Lottie/Rive/Three playback/final rendering
remain separate work. Image decoding is bounded by the existing asset size and
upload policy; arbitrary remote images are intentionally unsupported.
