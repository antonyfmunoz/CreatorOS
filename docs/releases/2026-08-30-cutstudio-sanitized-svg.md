# CutStudio sanitized SVG final rendering

Date: 2026-08-30

## Outcome

Creators can author bounded inline SVG graphics and retain them in the final
private MP4. The same canonical vector source now drives validation, preview,
EDL compilation and server rendering.

## Architecture and safety

- A shared fail-closed sanitizer accepts only `svg`, `g`, `path`, `rect`,
  `circle`, `ellipse`, `line`, `polyline` and `polygon` with bounded geometric
  and paint attributes.
- It rejects scripts, event attributes, CSS, links, nested documents, entities,
  declarations, external or data URLs, unsupported namespaces, malformed
  nesting and unparsed text.
- The browser previews only canonical source in an isolated image context. The
  server sanitizes again before Sharp rasterization and feeds that private PNG
  into the existing bounded motion, transform, perspective and filter graph.
- SVG source is capped at 20,000 characters and paths/attribute values remain
  separately bounded.

## Qualification contract

- Unit tests prove canonical safe source and reject script, external image,
  event-handler, remote paint and document-declaration payloads.
- A fresh 115-migration database field run on Pixel 7 and desktop Chromium
  authors the SVG through normal controls, saves and applies the composition,
  renders and downloads its private MP4, then proves exact green vector pixels
  in the final artifact.
- Full repository verification, secret scan, protected CI, exact release
  identity and production smoke remain mandatory.

## Remaining boundary

Image/font asset selection, native Lottie/Rive/Three playback and final render,
animated 3D/flip, geometric masks, and remaining stylized effects are separate
work. Arbitrary HTML, CSS, JavaScript, URLs and executable SVG features remain
intentionally outside the trusted composition format.
