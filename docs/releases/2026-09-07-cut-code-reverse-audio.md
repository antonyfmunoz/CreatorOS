# CutStudio isolated reverse-audio candidate

**Status:** local, exact-source candidate. Not deployed. Not a managed-execution
approval or a Remotion parity claim.

## Scope

The private CutStudio code runtime now supports `reverse: true` for explicit
soundtracks and React `FrameAudio`. A reverse interval starts at the declared
later source moment, trims only the preceding bounded source interval, reverses
that interval inside the isolated FFmpeg graph, then applies the existing
pitch-preserving 0.5x–2x retime, gain envelope, limiter and output bounds.

The capability remains deliberately narrower than general audio editing:

- it is available only in sealed capsule-local audio/video inputs;
- the existing 120-second source, eight-stream, eight-track, 192 kHz and
  artifact/runtime limits still apply;
- reverse intervals cannot use implicit source looping; authors must declare
  each repeated reverse interval explicitly;
- source paths, demuxers, protocol permissions, network isolation and
  executable-capsule policy are unchanged.

## Local qualification evidence

On the current unmerged branch, the focused contract suite passed:

```text
node --test runtimes/cut-code/request.test.mjs \
  runtimes/cut-code/audio.test.mjs \
  runtimes/cut-code/frame-audio.test.mjs \
  runtimes/cut-code/sdk-types.test.mjs
```

The exact-source local qualification image was rebuilt, then the isolated
render fixture generated and decoded a private MOV. Its first decoded window
contained 1320 Hz energy of approximately 528 against 880 Hz energy of about
4; its later window contained 880 Hz energy of approximately 526 against 1320
Hz energy of about 4. This demonstrates later-to-earlier source traversal in
the actual isolated output, not merely request acceptance.

An attempted broad local runtime sweep reached its later retained artifacts but
did not seal a final receipt before its process exited. It is intentionally not
recorded as a passing full-suite result. The exact-head protected CutStudio code
runtime workflow must reproduce the complete isolated suite before this source
inherits candidate qualification.

## Still open

This change does not supply browser preview audio for arbitrary TSX, reverse
source-loop semantics, broad codec compatibility, public executable code,
managed compute, production field output, or same-input Remotion/operator
benchmark evidence. Those gates remain in the CutStudio closure register.
