# Render the submitted edit, not a later project state

Previously, ordinary queued exports read the mutable project at execution time.
Composition batches already captured their manifests, but ordinary exports and
their review records could drift when the project was edited after submission.

## Change

- Ordinary render admission stores a server-created snapshot of the EDL,
  transcript, source/project identity, name, duration and edit revision. A
  SHA-256 receipt covers its normalized content. The worker verifies that receipt
  and the live owned project/source before using the captured values.
- Admission holds the project row while capturing and inserting the job. It
  shares the batch owner's admission lock and retains the existing two-active-job
  ordinary-export limit; the explicit batch limit is unchanged.
- New browser requests include the expected edit revision. Stale revisions fail
  with a conflict instead of exporting an unseen edit. Legacy API clients without
  the header still get a snapshot of the saved revision at admission.
- Public callers cannot supply internal timeline or composition snapshots.
- Export controls wait for composition actions and pending timeline saves.
  Dirty-state comparison is memoized rather than recomputed on each playhead tick.
- Completion records the captured revision and content hash. Review versions
  use the same render project, not the current timeline. Retries retain their
  saved request. Legacy jobs are identified as `legacy_live`, not retroactively
  presented as immutable; their original unsaved history cannot be reconstructed.

Unit checks cover independent copies, later edits/caption changes, corruption,
wrong project/source, serialization and incompatible snapshot modes. Real browser
qualification holds Apply and autosave responses, checks disabled export controls,
rejects stale revisions/injected snapshots, changes the edit after queueing,
decodes a completed frame and verifies the original review version on mobile and
desktop. Existing fitting and impossible-bounds journeys remain in the gate.

The existing JSON job request stores the snapshot; no destructive migration or
new provider is introduced. Private assets must still exist and pass their live
authorization checks. This change is not public TSX execution or competitor
benchmark closure.
