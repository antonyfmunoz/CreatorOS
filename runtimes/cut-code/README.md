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
- `@creativesos/cut`: `useFrame`, `useComposition`, `useInputs`, `FullFrame`,
  local-frame `Sequence`, and numeric `interpolate`.
- Direct frame-driven PNG (including transparency) or a silent H.264 MP4.
  Frames and input props are passed explicitly to the React composition.
- Strict source, expanded-archive, dimensions, duration, pixel-frame, output,
  process, CPU, memory, temporary-storage and deadline limits. The host checks
  receipt hashes and preserves no private source in application logs.

The runtime is deliberately not a general JavaScript timing engine: asynchronous
state and arbitrary timers are not a reproducibility contract. Media playback,
audio mixing, arbitrary dependencies, PDF/WebP/JPEG direct output, image sequences,
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

Qualification asserts real pixels, moving geometry, relative module imports,
input binding, alpha, a probed MP4 frame count, denied internet/metadata/local-file
reads, actual watchdog timeout and actual abort, and no leftover containers.
Passing this proves the bounded contract, not arbitrary-code safety or competitor
equivalence for every possible input.
