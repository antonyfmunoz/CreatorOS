# One native text layout for preview and delivery

This follows the responsive-size/alpha correction, not a declaration of full
Remotion parity. Legacy graphics remain on their existing native raster path.
Newly applied declarative text and caption layers carry a versioned text layout
with their original canvas width. No data migration or bulk rewrite is needed.

## Implemented contract

- Literal text, explicit line breaks, automatic word wrapping and long-token
  wrapping inside a fixed, clipped layer rectangle.
- Left/center/right alignment, top/middle/bottom alignment, bounded line height,
  letter spacing, weight, normal/italic style, padding and corner radius.
- Composition-space units in both preview and output, including font sizes
  through 400 (previously accepted by the editor but truncated on compilation).
- The same shared CSS rules for interactive preview and fixed native raster;
  authored background fills the same layer rectangle, including transparency.
- One pinned, unmodified Noto Sans variable font and its OFL 1.1 license, shared
  by browser and worker. It is not a replacement for the application's UI font.
- Owned private font assets still require their existing authorization, ready
  state, MIME and SFNT signature checks. Native rendering loads their actual
  bytes, not an assumed system-family name. Missing fonts fail rather than
  silently substituting a successful output; preview readiness is visible.

## Runtime boundaries

The native text rasterizer accepts only the validated layout and literal text;
it does not accept HTML, user scripts, remote URLs or arbitrary style sheets.
It uses the existing native Chromium runtime, one browser per job and a fresh
offline, request-blocking context per title. Font size is bounded to 20 MB,
raster area to 3840x2160, text to 2000 characters, and each title has a 30-second
deadline with browser/context cleanup. The final existing FFmpeg motion,
effects, private-artifact and cancellation workflow remains authoritative.

This is not the public code-capsule executor and does not bypass its security
gate. Self-hosted workers using the new layout need Chromium in addition to
FFmpeg; the existing GCP CutStudio image already provides it and now copies the
pinned font/license into its final stage. Existing graphics without the layout
contract do not acquire this dependency retroactively.

## Evidence required

Pure tests cover layout units, bounds, compilation, preserved line breaks and
the exact font digest. The mobile/desktop native typography journey edits the
real controls, reloads saved values, counts preview lines, applies and renders
the composition, then checks line count/centering/spacing/background in decoded
private output pixels and denies cross-account access. The existing private
frame/portrait journey and the broader programmable-cinema journey remain
required. Record local, protected and live artifact results separately.

### Local observations

The first dedicated test used an incorrect multipart field and failed at the
upload boundary; that fixture was corrected, not the application boundary.
Both mobile and desktop typography journeys then passed in 1.7 minutes. Both
existing exact-frame/portrait journeys also passed with the new native renderer.
The final expanded authoring changes still require the complete fresh rerun.

The standalone native renderer qualification produced three inspected PNGs:
wrapped three-line centered type, the complete portrait headline and literal
HTML-looking text in italic. Pixel checks verify actual glyphs and retained
partial alpha; calls after renderer closure are rejected. Local hashes:

- Wrapped: `622ddd1623f957eacd50494bba32df0a21a4f635212fb8f1312590a2e8c5e5a7`
- Portrait: `f938510b271adb181b565628441461b08a8981688f6f093bc82a80ac2f1fce9a`
- Literal: `4667f5d4f2a43dad35d4fe35efc3f7f7810d4c3a7c9310ed3ab2ca34f105f99b`

These local Windows/Chromium observations are not a substitute for protected
Linux verification, the corresponding worker deployment or a live private
artifact. No claim of cross-browser byte-identical antialiasing is made.

## Explicit limits

No claim of every-script/emoji fallback equivalence, rich-text runs, text-on-path,
arbitrary CSS/React execution, browser-engine-independent pixel identity, or
human-reviewed competitor superiority. The default Noto Sans file covers its
own glyph repertoire, not every Noto family. Reapply a saved composition to
use this new text contract. Public code execution still requires its separate
production/security qualification.
