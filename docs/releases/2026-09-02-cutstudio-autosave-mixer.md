# Revision-safe editing and primary mixer controls

Autosave now serializes writes for the active project. A confirmed response
updates the saved baseline and revision, but never replaces a newer local edit.
That newer draft is then saved with the confirmed revision. Failed writes retain
the draft, stop automatic retry and expose an explicit retry action. Opening or
leaving a project invalidates callbacks from the previous view; late project-open
responses cannot replace a newer selected project. Existing If-Match conflict
protection remains mandatory.

The new slow-response test also exposed a pre-existing native gap: older v2
timelines displayed primary-track mixer controls but discarded their input.
The first track edit now upgrades the sequential timeline without changing
source trims, speed, clip volume or concatenation order. Associated longer media
retains its source extent. The simple native renderer now honors primary-track
gain/mute, routing gain and clip-volume envelopes, as the multitrack path does.

Local evidence:

- Ten mobile/desktop browser journeys passed in 1.6 minutes: rapid edits across
  a held committed response, failed-save retention and explicit retry, late-save
  isolation after project switching, rendered primary gain/mute, and the existing
  immutable timeline/review journey.
- Actual simple-render audio was decoded: a quarter-gain export measured within
  0.23..0.27 of its baseline RMS and muted output below 0.00001 RMS. No claim is
  made from UI settings alone.
- Unit coverage checks legacy sequential timing preservation and longer private
  associated media. Full application and protected exact-source checks remain
  separate required release gates.

The first new browser fixtures exposed the real v2-control defect. Subsequent
fixture corrections disambiguated project-open versus delete buttons and used
FFmpeg's accepted decimal duration syntax. Failures were preserved; no test
threshold or deadline was weakened. Successful log:
`B:/CreativesOS-task-artifacts/autosave-browser-exact.log`.

This is not a blanket multitrack-preview, offline editing, conflict-merge or
Remotion parity claim. The closure register keeps those boundaries explicit.
