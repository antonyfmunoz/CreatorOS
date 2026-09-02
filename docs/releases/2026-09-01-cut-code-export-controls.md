# Isolated code export controls

The prototype adds direct PNG/JPEG/WebP stills, bounded lossy quality, inclusive
video frame ranges and PNG/JPEG/WebP image-sequence ZIPs. Sequence manifests retain
absolute frame numbers, dimensions/FPS, full-request identity and per-frame byte
counts/SHA-256. Range rendering preserves absolute animation timing. Admission
budgets actual requested frames, and sequence output shares the existing 64 MB
ceiling instead of multiplying it per frame.

Local verification includes twelve unit tests, decoded JPEG/WebP colors, a
probed six-frame H.264 excerpt whose first/last pixels cross the expected timeline
boundary, six individually decoded PNG sequence frames, all manifest hashes and
a second byte-identical sequence render. Existing motion, transparency, failed-
composition, network/metadata/file denial, timeout, abort and cleanup tests pass.
Receipt validation now rejects tampering with source, full inputs, output bytes,
dimensions, FPS, range, media type and output settings.

Protected Linux verification remains a separate gate. The runtime remains an
isolated prototype, not public application code execution or Remotion parity.
Code audio/media support, approved production execution, durable application
dispatch, private artifact exchange, editor/preview integration and locked
competitive performance/quality benchmarks are still open work.
