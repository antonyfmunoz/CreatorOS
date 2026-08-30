# CutStudio private fonts release candidate

CutStudio now carries an owned private font from upload through authoring,
browser preview, EDL compilation and native final rendering.

## Product behavior

- Creatives can upload bounded TTF or OTF files as private `cut-font` assets.
- A font must be associated with the owned CutStudio project before a
  composition may reference it.
- Text, caption and lower-third layers expose project-font selection and retain
  an asset-derived private family name rather than accepting an arbitrary
  filesystem path.
- The browser loads the authorized project stream with `FontFace`; it removes
  loaded faces on project change or unmount and ignores late async loads.
- EDL v3 retains both the authorized font asset ID and deterministic family.
- The renderer validates the sfnt signature, materializes the exact private
  asset, rasterizes text with FFmpeg `drawtext`, and excludes the font resource
  from audiovisual input indexing.

## Security boundaries

- Upload policy accepts only bounded TTF/OTF MIME families and filenames.
- Composition writes verify tenant ownership, project association, private
  visibility, ready state, `cut-font` kind and allowed MIME.
- Browser-supplied font paths, URLs, CSS and executable font behavior are not
  part of the contract.
- Cross-tenant project and asset references remain denied.

## Qualification

- Migration qualification applies all 117 migrations on a pristine database.
- Focused policy/compiler suites pass.
- Fresh authenticated mobile and desktop journeys upload a real system TTF,
  associate and select it, persist and apply the composition, complete a private
  MP4 render, decode frame pixels, reload persisted state and exercise reviewer
  and cross-tenant denials.
- Complete repository and protected-release gates remain required before this
  candidate is promoted beyond local proof.

Native Lottie/Rive/Three playback/final rendering, isolated executable
compositions, approved model execution and direct human competitor benchmarks
remain separate gates.
