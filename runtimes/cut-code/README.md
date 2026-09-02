# CutStudio code-rendering prototype

This is a separate native, clean-room React/TSX motion-graphics runtime. It is
**not wired to public application jobs, approved for multi-tenant production,
or a claim of Remotion parity**. Application readiness must continue to report
executable code as not implemented until its end-to-end dispatcher is qualified.

The [lean Noble candidate](../../docs/releases/2026-09-02-cut-code-noble-candidate.md)
passed the full local artifact/isolation suite and a zero HIGH/CRITICAL image
scan. Its independent CI job must reproduce that evidence. This does not grant
production topology approval or enable public code execution.

## Implemented execution contract

- A private ZIP with `package.json`, a TSX/JSX entrypoint and relative modules.
  No package installation, package scripts, arbitrary npm resolution, shell
  execution or network import occurs for a capsule. The runtime image contains
  the exact React 18.3.1 toolchain. Image and npm dependencies are pinned.
- Capsule-relative CSS imports and CSS modules support reusable motion-design
  styles. Nested `@import`, module `composes`, and private image/font `url(...)`
  references stay inside the archive and are bundled before rendering. Local
  SVG fragment references are allowed; remote, host and package stylesheet
  resources fail admission. CSS and JavaScript share the existing 25 MB compiled
  limit. No Sass, Tailwind build, PostCSS plugins or external font fetch is run.
  Styles are installed before source execution and private font readiness.
  As with inline styles, motion must be driven by composition frames, not
  wall-clock CSS animations or transitions.
- The MIT-licensed Three.js 0.185.1 core and its explicitly approved SVGRenderer
  addon can be imported by private source. This enables frame-driven geometry,
  perspective cameras, depth ordering and vector-shaded motion graphics without
  granting network imports or arbitrary addons. The dependency must be exact;
  ranges, other versions and unapproved addons fail admission/bundling. GPU
  WebGL/WebGPU compatibility is not qualified by the SVG tests. SVGRenderer does
  not support textures, shadows or advanced shading; it is not a replacement
  for those capabilities. See the [official renderer limitations](https://threejs.org/docs/pages/SVGRenderer.html).
- `@creativesos/cut`: `useFrame`, `useGlobalFrame`, `useComposition`, `useInputs`,
  `FullFrame`, local-frame `Sequence`, `Freeze` and bounded/alternating `Repeat`.
- Explicit asynchronous preparation: `holdFrame({timeoutMs})` returns an opaque
  handle; `releaseFrame(handle)` lets capture proceed only when every hold clears.
  `failRender()` permanently rejects the current render without exporting private
  exception content. The default hold is 10 seconds, maximum 30 seconds, with at
  most 64 pending handles. Deadlines begin at acquisition and cannot be reset by
  releasing an expired handle. Release is idempotent for cleanup. Hold before
  starting work, commit its state before release, and clean up on unmount. The
  renderer flushes React state and rechecks media/fonts and readiness after paint,
  with at most eight settlement rounds. Network access remains prohibited and
  the independent host deadline still wins. See the
  [actual async-frame receipt](../../docs/releases/2026-09-02-cut-code-frame-readiness.md).
- `FrameVideo` seeks a capsule-local MP4/WebM import at the local composition
  frame, with source offset, speed, repetition and end-frame freeze. It uses
  `startFrom` in composition-frame units, `speed` in `(0, 8]`, and `repeat` as a
  boolean. Up to eight simultaneous, at-most-120-second/4K sources are admitted.
  Embedded video remains muted by default. To include its source sound, name
  the same capsule-local MP4/WebM in an explicit `audioTracks` request.
  No external media URL or network permission is introduced.
- Stateless motion math: numeric keyframes with clamp/extend/wrap behavior,
  easing and cubic Bezier timing, analytic under/critical/over-damped physical
  springs, explicit sRGB hex/alpha transitions and keyed repeatable variation.
  `seededRandom` is creative variation, not cryptographic randomness. Spring
  mass/stiffness/damping are direct physical parameters. `measureSpring` returns
  a conservative continuous-time settling frame using an analytic error envelope,
  not a sampled first crossing. Its threshold is relative to the 0..1 response;
  undamped springs and results beyond the explicit frame budget are rejected.
  `spring` can fit this response to `durationInFrames`, reverse it, and delay it.
  Fitted/reversed motion holds exact endpoints outside its active interval;
  ordinary unfitted motion retains its original physical response. This is our
  own timing contract, not a claim of identical Remotion sample values.
- Direct frame-driven PNG (including transparency), JPEG or WebP; JPEG/WebP
  expose bounded 1..100 quality. JPEG and MP4 cannot carry transparency.
- H.264 MP4 with optional inclusive `[first, last]` frame ranges. Frame
  values stay on the absolute composition timeline; range output starts at
  media timestamp zero and contains exactly `last - first + 1` frames.
- Optional `videoEncoding` controls for MP4/WebM select either constant quality
  (`crf`, H.264 1..51 or VP9 0..63) or a target `bitrateKbps` in 64..100000, never
  both. H.264 exposes the nine `preset` speeds from `ultrafast` to `veryslow`;
  VP9 exposes `cpuUsed` in 0..8. Codec-incompatible settings fail admission.
  Omitting the object preserves the existing encoder defaults. Explicit defaults
  are H.264 CRF 23 / fast and VP9 CRF 30 / CPU-used 4. Lower CRF usually retains
  more detail at greater size; target bitrate is not an exact constant-rate or
  quality guarantee. The same one-thread, deadline and byte caps apply. Receipts
  bind normalized quality and speed controls. Actual decoded noise-fixture
  artifacts prove a quality/size tradeoff, not generalized competitor superiority.
- Opt-in `format: "webm"` video exports use VP9 with an alpha channel and, when
  requested, an Opus soundtrack. Transparent areas of the composition remain
  transparent; an authored opaque background remains opaque. This is a bounded
  single-pass export, not distributed alpha chunk stitching. MP4 stays the
  default opaque output. WebM preserves the same even-size, frame, pixel-frame,
  CPU, memory, deadline and byte limits. It is not ProRes, HDR or universal-device
  playback support. Private WebM overlays can be reused through `FrameVideo`.
  Both silent and Opus muxing use reproducible container metadata. Owned alpha
  and quality-control fixtures replay byte-for-byte in both qualified images;
  this does not make arbitrary wall-clock or random capsule code deterministic.
  See the [WebM replay receipt](../../docs/releases/2026-09-02-cut-code-webm-replay.md).
- Opt-in `format: "gif"` video exports use a shared 255-color palette plus a
  reserved transparent entry. Transparency is binary (alpha threshold 128), not
  the partial alpha available in WebM/PNG. `gifOptions.frameStep` in 1..30 samples
  absolute frames starting at the range's first frame; the shortened final hold
  preserves range duration to GIF's centisecond precision. `repeatCount: null`
  repeats indefinitely, `0` plays once, and 1..1000 repeats that many times after
  the initial play. Defaults are step 1 and indefinite repetition. GIF supports
  odd dimensions, at most 50 composition FPS and a stricter 100-million full-range
  pixel-frame palette budget; sampling cannot bypass that budget. Other execution
  and byte caps remain unchanged. Soundtrack requests fail explicitly because
  GIF cannot carry audio. Receipts bind the sampling/repetition settings, original
  range and actual sampled frame count; `fps` remains the composition frame rate.
  Decoded artifacts verify moving transparency without trails, opaque colors,
  frame delays, repeat metadata, one-frame ranges and byte-identical replay.
- Opt-in `format: "mov"` exports use FFmpeg's ProRes encoder with
  `proresProfile: "422hq"` (default), `"4444"`, or `"4444xq"`. HQ is opaque;
  4444/XQ retain full and partial transparency. Explicit soundtracks use
  uncompressed PCM16, 48-kHz stereo, not AAC. Profiles, frames, range and output
  bytes are receipt-bound. The same even-dimension, frame, pixel-frame, time,
  memory and 64-MB artifact limits apply; large intermediate files must use
  bounded ranges and can still exceed the output limit. This is an 8-bit SDR
  browser capture encoded into a higher-precision editing codec, not recovered
  source precision, HDR, a lossless claim or a browser-playable replacement for
  MP4/WebM. Compatibility with external editing applications requires separate
  field qualification. Encoder vendor identity is not spoofed as Apple's encoder.
- Optional `audioTracks` on video requests mix up to eight capsule-local
  WAV/MP3/FLAC/Ogg/MP4/WebM files into stereo AAC (MP4) or Opus (WebM). Tracks have a composition start frame,
  exclusive end frame, source trim in seconds, constant gain and 0.5..2 speed.
  Range exports retain original audio timing rather than restarting soundtracks.
  Sources are bounded to 120 seconds, eight channels and 192 kHz; decoder names
  and local input paths are fixed by the runtime. A 0.95 peak limiter protects
  summing, without normalizing quiet material upward. No network input is allowed.
- `mode: "audio"` exports the explicit soundtrack mix without bundling or
  executing visual capsule code or starting Chromium. Formats are PCM16 WAV
  (default), 192-kbit/s MP3 and 192-kbit/s AAC in M4A, all 48-kHz stereo. This
  uses the same source validation, stream selection, track gain, fades and
  absolute range clock as video soundtracks. Empty/nonoverlapping mixes emit
  genuine silence; missing or out-of-bounds sources fail instead of becoming
  silence. A request can cover at most 120 seconds within the one-hour timeline;
  video pixel-frame limits do not apply to a path that renders no pixels.
  CPU, memory, isolation, source, output and deadline caps remain unchanged.
  Width/height stay in the composition/request receipt but no video stream is
  created. Raw ADTS AAC and React audio-component discovery are not implemented.
  MP3 container duration can include encoder padding and AAC decoding can include
  a padded final packet; WAV has exact PCM sample counts and verified replay.
- `audioStream` selects a zero-based audio stream (not the overall video stream
  index), defaulting to the first. At most eight audio streams are admitted per
  file. Missing streams fail; they never silently deliver a mute artifact.
  The selected stream's decode limits and duration are checked. Video soundtrack
  trim is relative to that audio stream's beginning, including containers with
  non-zero starting timestamps. MP4 external-track and absolute-path references
  are explicitly disabled; demuxers and protocol permissions stay fixed.
- A soundtrack may have 1..32 `volumeKeyframes` with integral, strictly increasing
  track-local `frame`, `value` in 0..2, and `interpolation` of `linear` (default)
  or `hold`. The outgoing interval uses the left point's interpolation. The
  first/last value holds outside the points. Keyframe gain multiplies constant
  track volume; the existing mix limiter remains in force. Gains are evaluated
  per output sample after source retiming; playback speed does not retime gain,
  and range exports continue the original track-local clock. Zero is a true
  mute. Keyframes cannot lie beyond the track's exclusive end. This bounded
  data contract does not execute arbitrary callbacks in the host or provide
  React `<Audio>` lifecycle integration. Existing requests without keyframes
  retain their normalized shape and filter order.
- PNG/JPEG/WebP frame-sequence ZIPs with absolute-frame filenames, dimensions,
  FPS, a full-request hash and per-frame SHA-256/byte counts in `manifest.json`.
  ZIP timestamps are fixed, and actual PNG-sequence replay is byte-checked.
  The whole sequence shares the 64 MB output and 500-million pixel-frame limits.
- Host receipt verification binds source bytes, the full normalized request
  (including input parameters), output bytes, dimensions, format, FPS and range.
  A receipt is not itself proof of visually correct media; decoded-pixel tests
  are independent gates.
- Strict source, expanded-archive, dimensions, duration, pixel-frame, output,
  process, CPU, memory, temporary-storage and deadline limits. The host checks
  receipt hashes and preserves no private source in application logs.
- Timelines may span up to one hour, but each video/sequence request is still
  capped at 600 frames, 500 million pixel-frames, 64 MB and its execution deadline.
  Longer projects require explicit bounded frame ranges; there is no automatic
  unmetered fan-out. Stills can address any valid frame without rendering earlier
  frames. Odd dimensions are supported for images; H.264 retains even dimensions.

The runtime is deliberately not a general JavaScript timing engine: unregistered
asynchronous state and arbitrary timers are not a reproducibility contract.
Explicit frame holds coordinate preparation, but cannot make nondeterministic
source data deterministic or grant external network access. Video codec/VFR
compatibility beyond the qualified MP4 fixtures, per-frame React audio envelopes,
automatic React video-audio lifecycle mixing, arbitrary dependencies, PDF output,
distributed rendering, preview integration and broad visual benchmarks remain.

## Typed source authoring

The checked-in `sdk.d.ts` describes the actual `@creativesos/cut` exports and
the capsule-local asset imports. Include it in your local TypeScript project
alongside your TSX source, with React JSX, strict checking, and `noEmit` enabled.
It provides editor completion and catches wrong prop names, missing timing
inputs, and ordinary external video URLs before a render request is submitted.
`useComposition()` requires the runtime's provider and fails explicitly outside
it; `useInputs<YourInputs>()` supplies an author-selected input shape.

Types do **not** validate untrusted JSON, numeric bounds, source files or URLs at
runtime. Admission, bundling, input/media validation and isolation remain
mandatory. There is no public npm SDK or general app-side code execution in this
change, and the declarations are not a Remotion compatibility layer.

`npm test` typechecks a valid TSX composition and negative examples using the
pinned TypeScript compiler. It also compares declaration exports to the actual
SDK source and checks the configuration hook inside/outside its provider. These
tests complement, rather than replace, the decoded-pixel container qualification.

## Isolation and qualification

Build from this directory with `docker build -t creativesos-cut-code:qualification .`.
Run `npm ci --ignore-scripts`, `npm test`, then `npm run qualify` on a machine with
Docker, FFmpeg and ffprobe. Only assistant-authored synthetic capsules are used by
the qualification harness. Generated artifacts and receipts are ignored by Git.

The host creates a uniquely identified container from an immutable local image:
non-root, no capabilities, no network, no ports, no host IPC/PID namespace,
no-new-privileges, filtered syscalls, read-only root and a single read-only input
mount. There is no host output mount, Docker socket, credential mount or app
environment. Artifacts return through bounded stdout after a successful render.
On Linux the child uses the host caller's non-root UID/GID, so its private 0700
input directory stays private and remains readable without widening filesystem
permissions. Windows uses the non-root 1000:1000 identity. Root host invocation
is rejected.
The parent removes the exact container on success, failure, timeout or abort.
The child independently checks its effective capabilities, syscall filtering,
no-new-privileges and loopback-only network before loading a capsule. Chromium
must launch with its sandbox enabled; there is no no-sandbox fallback.

`seccomp.json` derives from Microsoft Playwright v1.62.1's Docker profile,
https://github.com/microsoft/playwright/blob/v1.62.1/utils/docker/seccomp_profile.json
under the included Apache-2.0 license. Our modification permits the `chroot`
syscall for Chromium's child user-namespace sandbox while keeping **all container
capabilities dropped**. It does not grant a host or container capability.

Microsoft describes the base image as testing/development-only. This harness is
therefore a local qualification boundary, not a public-execution deployment:
https://playwright.dev/docs/docker. Production needs a reviewed execution image,
isolated compute/network/IAM, durable dispatch/cancellation, private asset exchange,
per-tenant cost admission, vulnerability scanning, receipts, recovery and red-team
qualification. Never execute capsule code inside the API worker or app origin.

Qualification asserts real pixels, moving geometry, relative module imports,
input binding, alpha, a probed MP4 frame count, denied internet/metadata/local-file
reads, actual watchdog timeout and actual abort, and no leftover containers.
Passing this proves the bounded contract, not arbitrary-code safety or competitor
equivalence for every possible input.

## Motion authoring example

```tsx
import { FullFrame, useFrame, useComposition, spring, interpolateColor } from '@creativesos/cut';
export default function Launch({ title }) {
  const frame = useFrame();
  const { fps } = useComposition();
  return <FullFrame style={{
    background: interpolateColor(frame, [0, 60], ['#08080cff', '#182850ff']),
    display: 'grid', placeItems: 'center', color: 'white',
  }}>
    <h1 style={{ transform: `scale(${spring({ frame, fps, damping: 14 })})` }}>{title}</h1>
  </FullFrame>;
}
```

This is our native API, not source-compatible Remotion. Public documentation on
[spring motion](https://www.remotion.dev/docs/spring),
[easing](https://www.remotion.dev/docs/easing) and
[repeating sequences](https://www.remotion.dev/docs/loop) informs the user jobs;
no competitor implementation is copied. The qualification suite checks actual
nested timing, global frames, frozen frames, Bezier position and color pixels,
and rejects React effect failures instead of accepting a blank artifact.
