# CutStudio code-rendering prototype

This is a separate native, clean-room React/TSX motion-graphics runtime. It is
**not wired to public application jobs, approved for multi-tenant production,
or a claim of Remotion parity**. Application readiness must continue to report
executable code as not implemented until its end-to-end dispatcher is qualified.

## Implemented execution contract

- A private ZIP with `package.json`, a TSX/JSX entrypoint and relative modules.
  No package installation, package scripts, arbitrary npm resolution, shell
  execution or network import occurs for a capsule. The runtime image contains
  the exact React 18.3.1 toolchain. Image and npm dependencies are pinned.
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
- `FrameVideo` seeks a capsule-local MP4/WebM import at the local composition
  frame, with source offset, speed, repetition and end-frame freeze. It uses
  `startFrom` in composition-frame units, `speed` in `(0, 8]`, and `repeat` as a
  boolean. Up to eight simultaneous, at-most-120-second/4K sources are admitted.
  Embedded video remains muted; source audio is not included in exports yet.
  No external media URL or network permission is introduced.
- Stateless motion math: numeric keyframes with clamp/extend/wrap behavior,
  easing and cubic Bezier timing, analytic under/critical/over-damped physical
  springs, explicit sRGB hex/alpha transitions and keyed repeatable variation.
  `seededRandom` is creative variation, not cryptographic randomness. Spring
  mass/stiffness/damping are direct physical parameters; duration remapping and
  spring-settling measurement are not implemented by this API.
- Direct frame-driven PNG (including transparency), JPEG or WebP; JPEG/WebP
  expose bounded 1..100 quality. JPEG and MP4 cannot carry transparency.
- H.264 MP4 with optional inclusive `[first, last]` frame ranges. Frame
  values stay on the absolute composition timeline; range output starts at
  media timestamp zero and contains exactly `last - first + 1` frames.
- Optional `audioTracks` on video requests mix up to eight capsule-local
  WAV/MP3/FLAC/Ogg files into stereo AAC. Tracks have a composition start frame,
  exclusive end frame, source trim in seconds, constant gain and 0.5..2 speed.
  Range exports retain original audio timing rather than restarting soundtracks.
  Sources are bounded to 120 seconds, eight channels and 192 kHz; decoder names
  and local input paths are fixed by the runtime. A 0.95 peak limiter protects
  summing, without normalizing quiet material upward. No network input is allowed.
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

The runtime is deliberately not a general JavaScript timing engine: asynchronous
state and arbitrary timers are not a reproducibility contract. Video codec/VFR
compatibility beyond the qualified MP4 fixtures, per-frame React audio envelopes,
automatic video-audio extraction, arbitrary dependencies, PDF output,
distributed rendering, preview integration and broad visual benchmarks remain.

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

`Dockerfile.production` is an additional **candidate**, based on a digest-pinned
official Node Debian image with Debian Chromium, FFmpeg and fonts. It is not yet
approved for public execution. Unlike the development image it has no bundled
Firefox/WebKit/test browsers. The image owns the fixed Chromium executable;
capsules cannot supply binary paths or flags. Both variants require the same
non-root Chromium sandbox and host isolation with no fallback.

Build it with `docker build -f Dockerfile.production -t
creativesos-cut-code:production-candidate .`, then run the unchanged full suite
with `CUT_CODE_IMAGE_VARIANT=production-candidate npm run qualify` (set the
environment variable using the syntax for your shell). Evidence is separated
under `qualification-output/<variant>/`. Installed OS/browser/Node versions are
recorded inside the candidate image; the resulting immutable image digest, not
just the base digest, must bind scans and qualification before promotion.
Rebuild and scan OS and npm dependencies for every release. A custom Dockerfile
does not remove the need for dedicated execution-host isolation, tenant budgets,
dispatch/cancellation, security review or production field evidence.

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
