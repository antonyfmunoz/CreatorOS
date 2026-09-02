# CutStudio bounded soundtrack automation

The isolated code-render prototype now accepts explicit gain keyframes on its
existing private soundtrack requests. This supports fades, held gain changes
and mute while retaining trim, speed, constant gain and bounded range exports.
The contract is documented in `runtimes/cut-code/README.md`; it is not arbitrary
JavaScript evaluation or a claim of a public React audio component.

Reference capability: [Remotion volume automation](https://www.remotion.dev/docs/audio/volume).
This is our own numeric keyframe and sample-evaluated mixing implementation.
No competitor source was copied. No audio provider or network permission is added.

## Evidence and limits

- The native filter check uses actual decoded sine samples for fade, static-gain
  multiplication, delay, held edges, range continuity, playback-speed-independent
  gain timing and the maximum 32-keyframe limit.
- Admission tests reject malformed ordering, bad values, expression strings,
  points outside the track and excessive work. Receipt tests bind the complete
  normalized automation and reject altered gain or interpolation.
- Container qualification exports and decodes a real AAC soundtrack with a
  fade, plateau and mute, then checks the same timing in a partial export.
- The existing image-isolation, cancellation, pixel and media tests remain;
  prototype qualification does not approve the separate production candidate.

Local, protected and production status must remain separate. Public execution
is still not implemented. Production image security, durable dispatch, tenant
admission, app preview and broader competitor workflows remain open.
