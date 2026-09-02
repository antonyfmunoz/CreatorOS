# Responsive title scale and transparent raster correction

## Evidence and root cause

Decoded production frame 30 of job `55ddd4f7-c089-451e-9391-692dd70269cb`
showed a 1920-wide composition's 72-pixel title being rendered at 72 delivery
pixels on a 406-wide portrait output. Its intended scaled size is 15.225 pixels.
The compiler discarded the reference width, while the preview used relative
canvas units. Separately, generating a YUV color source and only then converting
to RGBA discarded source transparency, leaving black strips around the title.

## Change and compatibility

Newly applied compositions retain bounded `fontReferenceWidth` in EDL v3.
Delivery uses the same canvas-width ratio for the title size and its existing
box padding. Manual/legacy graphics without that field keep their pixel sizing;
we do not guess the source canvas of previously applied graphics. Reapply a
saved composition to adopt the reference width. No database migration or bulk
rewrite is involved.

The native color source requests RGBA before format negotiation. UTF-8 title
content is read from a private temporary text file with expansion disabled,
rather than inserted into filter syntax. Existing ownership/font validation,
render budgets, asset access and motion processing remain in force.

## Qualification

Four native tests decode actual PNG pixels: complete portrait glyph bounds
match an unclipped wider reference; glyph height scales with canvas width;
transparent corners and partial background alpha survive; punctuation and
filter-looking strings remain literal text. Compiler tests retain custom-font
identity alongside the source width. The existing mobile/desktop exact-frame
journey now applies a landscape-authored headline, renders portrait output,
checks background color through the transparent raster and bounds the actual
encoded glyph height. Existing permission, format, pixel identity and decoded
video-dimension checks remain, without increasing the test deadline.

Local full/browser qualification, protected qualification and deployment are
recorded separately as they finish. A fresh live render after reapplying the
composition is required before calling the production text defect corrected.

## Still outside this correction

Automatic wrapping, multiline line-height, preview/export background extents,
baseline/padding alignment, complete font fallback/shaping equivalence and
arbitrary rich text still need a unified layout contract and direct pixel
qualification. This targeted correction is not complete text-renderer or
Remotion feature parity. The separate public code-execution candidate remains
blocked by its unwaived high/critical vulnerability scan.
