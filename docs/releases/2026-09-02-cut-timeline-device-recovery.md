# CutStudio optional device recovery candidate

This candidate closes a bounded local-draft recovery gap, not full offline
editing or general Remotion parity. It is not yet deployed.

## Behavior and boundaries

- Opt-in, per-account setting. No timeline data is stored before opting in.
- Browser storage retains timeline text and settings, not the media payloads.
  It is not application-encrypted; shared devices are explicitly discouraged.
- Account/business/project and independent page-writer identities partition
  records. The component is enabled only after the project was fetched with the
  same currently signed-in account. A new account does not inherit preferences.
- Per-account Web Locks serialize every application's storage read/write/delete
  path across tabs. Browsers without that API fail closed. Storage errors and
  quota exhaustion never produce a successful device-save label.
- Copies are bounded to 256 KiB each and ten per account. Expired records are
  removed on access/admission after seven days; this is not a background eraser
  while the browser is closed. Unrelated local storage is never cleared.
- Recovery is explicit. A fresh authorized server read must still match the
  copy's original revision, account, business and active project. The normal
  revision-checked autosave then saves the restored timeline. A server conflict
  retains the copy for download/comparison rather than overwriting team work.
- Exact saved-timeline equality removes matching copies. Download is JSON data,
  not code execution. Discard and account-wide opt-out require explicit in-app
  confirmation; neither action changes the server project.

## Qualification status

- Initial type checking passed and all eight storage unit tests passed.
- Browser scenarios cover lost page state, explicit restore with exact next
  server revision, a race with a newer remote edit, two writers, cross-account
  isolation, opt-out, and unavailable storage. Their execution is pending.
- Full local/protected root and browser qualification, exact deployment and
  normal-user field recovery remain required. Private media download/caching,
  encrypted local custody, full offline editing, and recovery of creative brief,
  composition/workflow drafts are not covered by this timeline-only candidate.
