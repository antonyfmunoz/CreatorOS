# CutStudio composition project media

Date: 2026-08-30

## Outcome

Normal users can add video and audio layers to a declarative CutStudio
composition and select the exact owned project-media asset without editing a
manifest or writing code.

## Product behavior

- Video and audio layer choices appear only when compatible project media is
  available.
- A new media layer selects a compatible project asset by default and exposes
  a named project-media selector.
- Saved manifests retain the exact private asset identifier.
- Composition compilation assigns media layers to stable tracks in manifest
  order, including a deterministic `v1` primary track when multiple video
  layers share a start frame.

## Qualification

- TypeScript and focused production-runtime tests pass, including a regression
  for simultaneous primary and overlay media layers.
- A fresh 115-migration browser environment passes the complete programmable
  cinema lifecycle on mobile and desktop.
- The field journey selects a real private project asset in the authoring UI,
  applies it with a second video layer, renders the resulting H.264 artifact,
  verifies frame-level title motion, and continues through variant, workflow,
  tenant-isolation and reviewer assertions.

## Remaining boundary

Image/font/Lottie/Rive/Three media selection and their native final-render
adapters remain separate renderer work. This release does not claim those
formats or executable-code composition support.
