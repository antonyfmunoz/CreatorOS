# Transparent motion-graphics video

The isolated code-render prototype accepts an explicit WebM output, encoded as
VP9 with alpha. PNG capture preserves a transparent composition background and
partial opacity before encoding. Optional soundtrack mixing uses Opus and
copies the video stream without flattening its alpha. H.264 MP4 remains default.

Reference capability: [Remotion transparent video](https://www.remotion.dev/docs/transparent-videos).
This implementation uses our existing private renderer and fixed native codec
arguments, with no competitor code or new runtime network permissions.

Qualification must establish transparent, opaque and half-opacity pixels after
actual VP9 decoding, frame-dependent motion, audible Opus with preserved alpha,
and reuse through the private `FrameVideo` renderer over a new background.
An alpha-mode metadata tag by itself is not accepted as visual proof.

The same output bytes, dimensions, frame count, pixel-frame budget, process,
CPU, memory and deadline constraints remain in place. Public code execution,
the production-image security gate, app workflow integration, ProRes/HDR and
cross-device playback qualification are separate, still-open work.
