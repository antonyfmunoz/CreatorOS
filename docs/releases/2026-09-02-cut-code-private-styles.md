# Private stylesheet authoring for code compositions

This closes a bounded authoring gap in the isolated code runtime: reusable
CSS files and CSS modules instead of only inline React style objects.

- Global CSS imports, nested relative `@import`, scoped `.module.css` exports
  and module composition are bundled by the pinned compiler.
- Image and font URLs resolve only to admitted capsule files. Local SVG
  fragments remain possible. Remote URLs, host paths, missing files and
  unsupported resources reject before source execution.
- The compiler emits no filesystem artifacts. Its combined JavaScript and
  embedded stylesheet share the existing 25 MB limit. CSS is inserted as text,
  not parsed markup, before source execution and font readiness.
- The render document escapes closing script tags case-insensitively, including
  authored stylesheet string values. No CSP or network permission is widened.
- SDK declarations describe readonly CSS-module class mappings. Unit tests
  exercise resource containment, nested styles, module composition and typing.
- Actual-container qualification checks scoped colors, imported image pixels,
  an actually loaded private font, frame-driven positioning, and identical
  replay. Existing media, alpha, sound, timeout and cancellation tests remain.

Reference: the compiler's documented [CSS bundling and modules contract](https://esbuild.github.io/content-types/#css).
No competitor source or commercial library is copied. This does not add Sass,
Tailwind compilation, third-party style plugins, wall-clock animation
determinism, public code dispatch, or a Remotion-parity claim.

Local qualification: 29 unit/type/receipt tests and the complete real-container
harness passed, including all previous media and isolation tests. The frame-0
and frame-20 artifacts were decoded; frame-0 replay had identical bytes.
Protected checks must pass on the exact candidate before merge. These are
synthetic runtime receipts, not public production code-execution evidence.
