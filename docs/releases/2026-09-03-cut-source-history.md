# CutStudio bounded source history candidate

This candidate adds undo/redo for source text, file addition/deletion and
entrypoint changes. Selected files persist across Motion/Flows section changes.
Keyboard undo/redo is scoped to the source textarea and does not bubble into
timeline shortcuts. Buttons remain available to touch users.

History is held only in the current project mount, with a maximum of 40 retained
steps and an 8 MiB estimated retained-text/record budget. Older steps are evicted;
the current source remains intact. Opening another package, starting a new one
or discarding the source resets the history. This is not disk recovery, autosave,
cross-device persistence or an unlimited editor history.

Save receipts are not part of undo snapshots. Undo/redo retains the most recent
actual saved-source identity and recomputes dirty state against that identity.
Returning to never-saved starter text is still unsaved; returning to the exact
last saved source is clean. Undo does not overwrite any private ZIP or change
the saved composition's source/lockfile pair.

Tests added cover exact text/Unicode, file and entrypoint changes, mutable input
alias protection, no-op/save updates, branching after undo, step/text eviction,
reset boundaries, keyboard/button journeys, section persistence and honest saved
state. All 48 focused source/archive/lockfile/history tests passed locally.
Full combined-source qualification is pending; no deployment or Remotion-parity
claim is made.

The base dependency-pair candidate's original browser test attempted to inspect
multipart file bytes from a request event, which returned an empty string. This
candidate carries the correction to download the actual saved private lockfile
and compare exact bytes, including peer-account denial. Original failures remain
retained in protected run 33706659870. The production implementation and all
existing timeouts/quality gates are unchanged by that assertion correction.
