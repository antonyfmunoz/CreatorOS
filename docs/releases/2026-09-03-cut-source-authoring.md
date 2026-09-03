# CutStudio data-only source authoring

This change adds a text editor for small code-composition packages, not public
TSX execution or a Remotion-equivalence claim. The starter uses the clean-room
CutStudio SDK and pinned React version. Package scripts are never run, imports
are never evaluated, and no dependency installation happens in the application.

- Create a package, edit/select/add/remove text files and choose its TS/TSX entrypoint.
- Download a deterministic stored ZIP or save a **new** ready private project
  source asset through the existing upload/registration workflow.
- Reopen ready private project ZIPs through an authenticated, editor-only,
  no-store read route. Project, business, owner, asset kind and status must match.
- Text editing is bounded to 64 files, 256 KiB/file and 2 MiB total. Archive
  metadata/CRC/deflate validation remains authoritative. Larger or binary
  packages are rejected for editing, never silently truncated; normal ZIP
  import remains available. Inspection limits apply before decompression.
- Drafts survive section changes and participate in the existing navigation
  guard. Failed saves retain edits. A download is not a server-save receipt.
  There is no new localStorage retention, automatic source backup or offline
  media claim. A server save does not overwrite a previous source package.
- A matching dependency lockfile is still explicitly required to register a
  composition. Saving source does not approve dependencies or prove compilation.

Initial local evidence: 23 archive/authoring checks passed, including UTF-8,
deterministic byte replay, valid compressed-source reading, path/count/byte
limits, CRC corruption and rejection of binary/unsupported source files.
Type checking also passed. Initial local browser evidence at
`creativesos-browser-qualification-f83b5b8c006a47ebbd0ebf16075c7c42` failed:
three journeys timed out loading the development application's dependency
modules before reaching the editor. The fourth verified failed-upload draft
preservation, then exposed an incorrect test locator for a profile link absent
from the studio shell. The navigation test now uses the actual **Projects**
button and still requires the unsaved-edit confirmation and unchanged URL.
The 45-second test deadline is unchanged. A fresh complete browser run and
production field evidence remain pending. The separate executable service, user-facing code
player, broader media/3D/scale and same-input competitor benchmark remain open.

The corrected local run at source `e22d434` retained evidence in
`creativesos-browser-qualification-7331591cfcfc4545a2fb11e5e07360c6`: three
journeys passed, while the mobile full lifecycle hit the unchanged total test
deadline at its final request. Its trace retains actual save, reopen, immutable
revision and denied-access checks; this is **not a four-pass local receipt**.
The initial protected desktop run independently passed the lifecycle test but
failed the old navigation locator; the corrected protected result is separate.

Final hardening rejects over-budget text before replacing the current draft,
retains leading UTF-8 BOMs and supports ordinary `.ts` as well as `.tsx`
entrypoints. These changes require fresh type/browser qualification. Neither
source-package saving nor the starter's dependency declarations are proof of
lockfile/dependency-graph consistency, compilation or public execution.

Before final hardening, exact source `e22d4345c6d3559048a31ce4258e28f5f001d6e7`
passed protected Verify `33702702402`: 703 root tests in 165 files, 195 mobile
and 171 desktop browser passes, 24 existing desktop skips, no retries. CodeQL
`33702702367` passed. This independently covers the corrected source lifecycle
and departure behavior; it does not turn either failed local run into a pass.
