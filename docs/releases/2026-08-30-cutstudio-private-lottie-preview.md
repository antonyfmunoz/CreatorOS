# CutStudio private Lottie preview release candidate

CutStudio now accepts a deliberately bounded subset of self-contained Lottie
JSON as owned private project media and renders it in the exact-frame browser
scrubber. This closes the safe interactive-preview half of the Lottie workflow
without weakening the final-render boundary.

## Product behavior

- Creators can upload `.json` Lottie media up to 5 MB and select it on an
  editable composition layer.
- The preview loads through authenticated private asset access, uses the
  expression-free `lottie_light` SVG runtime, and follows the composition frame
  scrubber deterministically with no autoplay or hidden loop.
- Documents reject expressions, URLs, data resources, embedded images,
  footage, audio, cameras, unsupported layer types, excessive duration,
  dimensions, nesting, arrays, properties or node counts.
- Lottie assets remain owner/business/project scoped. Cross-tenant project
  registration is denied.
- Timeline apply fails closed while Lottie or Rive layers are present. The
  product never substitutes a placeholder or claims that browser preview is a
  final render.

## Qualification

- Focused schema, compiler, migration and asset-policy suites pass: 44 tests.
- A fresh disposable PostgreSQL database applied all 118 migrations.
- The authenticated programmable-cinema journey passed on Pixel 7 and desktop
  Chromium. It uploaded valid and expression-bearing documents, denied invalid
  and cross-tenant registration, rendered a real SVG preview, persisted the
  layer, proved fail-closed timeline apply, removed the layer, and completed the
  existing native final MP4 and variant-handoff lifecycle.

## Remaining boundary

Final Lottie artifact rendering needs the dedicated isolated animation worker.
Native Rive playback/final rendering, arbitrary imported Three scenes and
executable composition capsules remain separate isolated-runtime work.
