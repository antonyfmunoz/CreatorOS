# CreativesOS Broadcast — Clean-room provenance and product boundary

## Purpose

CreativesOS Broadcast is an independently authored browser and server implementation of common live-production behaviors. It is not a fork, derivative distribution, plugin, skin, or binary wrapper of OBS Studio. It does not link to, embed, redistribute, translate, or copy OBS source code.

The OBS project's own repository identifies OBS Studio as GPL-2.0-or-later software. This implementation therefore deliberately avoids incorporating or linking against OBS/libobs code so CreativesOS does not accidentally create a GPL-derived distribution. Engineering controls reduce that risk; final commercial trademark and copyright clearance remains a matter for qualified counsel.

First-party references checked on 2026-08-12:

- https://github.com/obsproject/obs-studio
- https://github.com/obsproject/obs-studio/blob/master/COPYING

## Permitted research inputs

- Publicly observable live-production concepts: scenes, sources, preview/program, transitions, transforms, audio mixing, recording, replay, encoder health, and RTMP/RTMPS/SRT output.
- Protocol and file-format documentation for WebRTC browser capture, MediaRecorder/WebM, FFmpeg, RTMP, RTMPS, SRT, MP4, and R2-compatible storage.
- The UMH Broadcast behavioral specifications and APIs. Those specifications expressly describe behavior rather than implementation expression.
- CreativesOS's own product doctrine, design system, privacy controls, asset model, distribution workflow, and UMH projection contract.

## Excluded inputs

- OBS source code, internal identifiers, comments, architecture, plugin code, UI assets, icons, translations, themes, or layout measurements.
- OBS trademarks, logos, product screenshots, visual trade dress, or claims of compatibility/affiliation.
- Third-party stream keys, sample credentials, copyrighted media, or recordings without the participants' required permission.

## Independent expression

- The interface uses CreativesOS navigation, components, colors, terminology, and information architecture.
- Scene graphs and transforms use normalized browser-canvas coordinates and CreativesOS-owned schemas.
- Capture and compositing use browser media APIs and Canvas; server encoding uses the separately installed FFmpeg executable.
- Provider destinations are stored in CreativesOS tables with AES-256-GCM encryption and are never returned to the browser after creation.
- Recordings remain private until the owner explicitly promotes them into Distribution Studio.

## Capability boundary

Broadcast implements common functional behaviors, not pixel-identical or source-identical replication. The product may truthfully describe itself as a live-production or broadcast studio. Product copy must not call it OBS, imply endorsement by OBS, or use OBS branding.

## Release review

Before each release, reviewers must confirm:

1. no OBS code, assets, screenshots, names, or copied UI expression entered the repository;
2. every external library and binary remains governed by its own license and distribution terms;
3. stream destinations and keys are encrypted and redacted from responses, telemetry, and logs;
4. recording and guest capture require applicable notice and consent;
5. tests cover owner isolation, destination SSRF controls, secret non-disclosure, explicit go-live, and private-first recording storage.
