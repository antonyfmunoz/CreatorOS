# CutStudio private Rive preview release candidate

CutStudio now accepts bounded private `.riv` media and renders it in the
exact-frame composition scrubber without loading runtime code or asset content
from a third-party CDN.

## Product behavior

- Creators can upload `.riv` files up to 5 MB, register them only to an owned
  project and select them on an editable composition layer.
- The preview fetches authenticated private bytes, validates the Rive header,
  and uses pinned `@rive-app/canvas-lite` 2.41.0 plus a versioned same-origin
  WASM endpoint.
- CDN fallback, external asset delivery, automatic Rive events, data binding,
  autoplay and canvas pointer listeners are disabled. The first linear
  animation is paused and scrubbed from the CutStudio frame clock.
- CSP permits only `wasm-unsafe-eval`; general `unsafe-eval` remains denied.
- Timeline apply fails closed while Lottie or Rive layers are present. Browser
  preview is never substituted for a final artifact.

## Qualification

- Focused Rive, production, migration and asset/security tests pass.
- A fresh disposable PostgreSQL database applies all 119 migrations.
- The authenticated browser journey verifies the exact WASM response, uploads
  an official MIT-licensed visible fixture pinned by blob and SHA-256, proves
  real nontransparent canvas pixels, scrubs and persists the layer, denies an
  invalid header and cross-tenant registration, proves fail-closed timeline
  apply, and completes the existing private final-MP4 and variant lifecycle.
- The release bundle gate now fails if the pinned WASM dependency is absent or
  exceeds its 800 KiB raw / 350 KiB gzip budget.

## Remaining boundary

Final Lottie/Rive artifact rendering needs a dedicated isolated animation
worker. Imported programmable Three scenes and executable composition capsules
remain separate isolated-runtime work.
