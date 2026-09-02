# Bounded automatic headline fitting

Automatic fitting is opt-in. It preserves the authored maximum font size and
can shrink text to a configured minimum, with an optional maximum of 20 lines.
Zero lines means no additional line-count constraint. The fixed layer rectangle,
padding, line height, letter spacing and loaded font are part of measurement.
No existing composition is silently opted in.

The preview waits for its own composition fonts and remeasures after a canvas
resize. The native raster uses the same bounded DOM measurement function after
loading the actual font bytes. At most 16 layout probes are performed per fit.
If the minimum size cannot fit, the preview reports overflow and native rendering
fails before publishing an artifact. The user can enlarge the layer, shorten
the text or lower the minimum. It does not claim arbitrary CSS, rich-text or
pixel-identical layout across different browser engines.

Official reference capabilities:
[Remotion width fitting](https://www.remotion.dev/docs/layout-utils/fit-text) and
[line-count fitting](https://www.remotion.dev/docs/layout-utils/fit-text-on-n-lines).
This implementation uses our existing data-only typography contract and its own
bounded measurement loop, not copied source or Remotion API compatibility.

## Local native evidence

A 120-unit headline was fitted into a 768 x 86 layer at 29.193603515625 pixels,
with two complete readable lines. Its PNG hash was
`e68cb82b6989428562ef098b070637e8eb04ec40707d9fe3a82d2e5593ed5387`.
The previously qualified wrapped, portrait and literal-text images retained
their exact PNG hashes. An impossible minimum-size request was rejected.

The expanded browser journey saves and reloads actual fitting controls, checks
the preview size and lines, applies the composition, verifies two decoded output
text bands, and exercises the impossible-fit error without an artifact. The
existing private-font, complete animation and finished-frame journeys remain
required. Final immutable-source local, protected and production evidence must
be recorded separately; this native observation alone is not release approval.
