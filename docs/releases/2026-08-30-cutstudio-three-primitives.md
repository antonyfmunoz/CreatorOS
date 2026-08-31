# CutStudio bounded 3D primitive release candidate

CutStudio now turns a safe editable 3D descriptor into both deterministic
browser preview geometry and native final-video pixels without executing user
code or loading a third-party scene.

## Product behavior

- Editors can add cube, pyramid and plane layers and control depth, primary and
  secondary faces, edge color and wireframe mode.
- Existing timing, position, scale, Z/X/Y rotation, perspective, transitions
  and allowlisted effects remain available to the primitive layer.
- One shared fail-closed descriptor and SVG generator feeds the browser and the
  server renderer, avoiding a preview-only placeholder.
- EDL v3 retains the exact primitive descriptor and the FFmpeg pipeline
  materializes it as a transparent private raster before motion/effects.

## Qualification

- Focused unit coverage proves schema rejection, inert SVG geometry and exact
  EDL compilation.
- Fresh isolated mobile and desktop browser journeys author a pyramid, verify
  its preview, render real private MP4s and detect the expected decoded pixels.
- Full repository, security and protected-release gates remain before this
  candidate can move beyond local qualification.

Native Lottie/Rive playback, imported programmable Three scenes and arbitrary
composition code remain separate runtime-isolation work; this release does not
claim those capabilities.
