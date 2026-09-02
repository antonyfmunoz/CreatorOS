# Stylesheets remain structured data

Protected CodeQL identified generated JavaScript containing JSON-serialized
stylesheet text (alert 87). The renderer's outer script-tag escaping already
protected its current HTML insertion, but the bundler itself still relied on
that later caller-specific protection. The finding is addressed in source,
not dismissed or suppressed.

The bundler now returns separate `javascript` and `stylesheet` fields. Their
combined size retains the existing 25-MB limit. Playwright transfers both as
structured arguments inside the isolated browser. A style element receives CSS
through `textContent` before the intended compiled script is installed through
its own text property and nonce. Authored text is never interpolated into HTML.
Capsule JavaScript remains intentionally executable only in the existing
no-network, non-root, read-only, Chromium-sandboxed qualification boundary.

All 32 runtime unit/type/receipt tests and the complete actual-container
qualification passed locally. This includes private CSS modules/fonts/images,
markup-like stylesheet strings, motion/alpha/audio output, byte replay,
network/metadata/file denial, timeout and cancellation cleanup. Image config:
`sha256:20da6143379208bdbc22d4c587d5e36393afc2c41fee595d8e4e6208c8c7bb0a`.

Logs: `B:/CreativesOS-task-artifacts/css-data-unit.log` and
`B:/CreativesOS-task-artifacts/css-data-isolated.log`.
Fresh protected CodeQL and application checks are required before merging.
This does not resolve the separate production-image vulnerability gate or
enable public executable capsules.
