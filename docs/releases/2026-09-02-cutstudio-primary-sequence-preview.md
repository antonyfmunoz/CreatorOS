# Primary sequence timing preview

The editor now has a private, on-demand primary-sequence preview separate from
the existing source monitor and finished-render preview. It follows edited V1
time rather than treating source recording time as the complete timeline.

Supported scope: chronological hard cuts between project media, source trims,
0.25..4 playback speed, explicit black gaps and trailing empty time. Manual
clip fades, clip volume automation and primary track/bus gain/mute follow the
native export's timing math. Keyboard-accessible 30-FPS scrubbing and frame
stepping pause playback. Loading media pauses the preview clock; closing the
dialog releases its player and audio graph. Opening pauses the source monitors.
Media is read through existing owner-checked private project routes, not a
public or permanent storage URL.

This is explicitly a primary timing monitor, not a complete composited output.
Titles, overlay video, separate audio tracks, LUT/color/effects, final aspect
framing and complete transitions still require rendered preview. Non-cut V1
transitions show that limit rather than playing a misleading hard-cut substitute.
Long/VFR sources, every browser/device, broader audio mixes and smooth real-time
performance remain separate qualification work. No Remotion parity claim.

Local qualification passed all 585 tests in 143 files, TypeScript, application
build/bundle budgets and worker checks. Four focused mobile/desktop browser
journeys passed in 1.4 minutes without retries, including the existing audible
primary mixer journey. Qualification includes pure source/time/gain/fade calculations and real mobile
and desktop browser pixels at leading/interior/tail gaps and red/green clips;
the same test independently verifies the native export's pixels/audio. It also
checks playback crossing a cut, pause, 0.5x/2x speed and trimmed-source seek times.
Protected CI, exact deployment and normal-user production field proof remain
separate gates. Local logs are `primary-preview-browser*.log` and
`primary-preview-verify.log` under `B:/CreativesOS-task-artifacts`.
