# CutStudio data-only source authoring

This change adds a text editor for small code-composition packages, not public
TSX execution or a Remotion-equivalence claim. The starter uses the clean-room
CutStudio SDK and pinned React version. Package scripts are never run, imports
are never evaluated, and no dependency installation happens in the application.

- Create a package, edit/select/add/remove text files and choose its TSX entrypoint.
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

Initial local evidence: 22 archive/authoring checks passed, including UTF-8,
deterministic byte replay, valid compressed-source reading, path/count/byte
limits, CRC corruption and rejection of binary/unsupported source files.
Types, full application/browser checks and production field evidence remain
pending at this checkpoint. The separate executable service, user-facing code
player, broader media/3D/scale and same-input competitor benchmark remain open.
