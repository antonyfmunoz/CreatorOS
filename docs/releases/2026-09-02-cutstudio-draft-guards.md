# Unsaved timeline departure and background refresh

CutStudio now asks before leaving an unsaved timeline through Projects, normal
navigation links, another project, or the distribution handoff. Downloading the
EDL does not count as navigation. Browser reload/tab-close has the browser's
native unsaved-work warning when that browser permits it.

Same-project background refreshes wait while a timeline save is pending or has
failed, then reload only after the save is confirmed. An edit made during the
refresh request also takes precedence over that older response. This preserves
the existing revision-serialized autosave and explicit failure/retry behavior.

Local field qualification, 2026-09-02: 14 journeys passed across mobile and
desktop, including rapid/failed autosaves, explicitly approved late-response
project switching, real rendered mixer audio, explicit discard/cancel behavior,
deferred background refresh and primary-gap outputs. Background completion and
network faults are controlled test fixtures, not provider/production evidence.
The timeline save and reload still use real local account-backed API/database
paths. Logs are `draft-guard-browser.log` and its error stream under
`B:/CreativesOS-task-artifacts`.

Scope remains explicit: this is not crash/offline draft recovery; browsers can
suppress unload dialogs, SPA history back/forward is not blocked by a cancellable
navigation event, and independent composition/transcript editor drafts need their
own custody policy. No private timeline is written to browser persistent storage.
Production behavior needs the exact released source and field qualification.
