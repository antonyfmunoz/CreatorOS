# CutStudio isolated animation final rendering

Status: release candidate

## Product change

CutStudio declarative compositions can now carry validated private Lottie and
Rive layers through timeline apply and final video rendering. The renderer no
longer treats these formats as preview-only media.

## Runtime boundary

- Lottie and Rive source files remain private project assets.
- Final frames render in a fresh headless Chromium context with service workers
  disabled and outbound network requests denied.
- Rive uses the pinned same-origin WASM runtime already reviewed for the app;
  external Rive assets, listener side effects and automatic events stay off.
- The renderer permits at most 3,600 frames and 4K pixels per animation layer.
- Generated RGBA frame sequences enter the existing FFmpeg multitrack render,
  preserving the source asset, composition layer and final artifact lineage.
- The GCP CutStudio worker image installs Chromium explicitly; no unverified
  browser download occurs at job time.

## Qualification

- `tests/cut-studio-production.test.ts` proves Lottie and Rive layers compile
  into editable EDL graphics and that Rive cannot omit its private asset.
- `tests/cut-animation-renderer.test.ts` proves deterministic frame budgets.
- `npm run verify:cut-animation` renders a real self-contained Lottie document
  in Chromium and verifies RGBA dimensions and timeline advancement.
- An additional local field run against the official Rive runtime repository's
  `bouncing_ball.riv` fixture produced three valid, distinct RGBA frames.
- Protected CI runs the self-contained qualification after installing its
  pinned Chromium runtime.

This closes the provider-independent Lottie/Rive final-rendering gap. Imported
programmable Three scenes, arbitrary code execution, approved generative-model
round trips and authorized competitor benchmarks remain separate gates.
