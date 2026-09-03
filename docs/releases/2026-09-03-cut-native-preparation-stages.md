# Native graphics preparation diagnostic candidate

The previous local programmable-cinema run retained a real render timeout.
In its desktop trace, job `39dc03c7-fe7e-46cd-b2f8-f1ac218ffc28` was accepted at
02:35:44 UTC and did not enter encoding until 02:36:32 UTC. Most preparation
polls reported layer 9/9. Status requests generally remained responsive. The
job was still rendering at its unchanged 60-second test deadline and the test
cancelled its own fixture. This evidence locates a slow phase; it does not
establish the cause or qualify render performance.

This candidate adds bounded, fixed-label timing around individual native
graphics and text preparation: font reads, browser/context startup, text/font
layout, fitting, screenshot capture and context/session cleanup. Each event
records the already-used job ID, layer ordinal/kind, stage, status and elapsed
milliseconds. It never copies text, source files, font paths, asset URLs, output
paths or exception messages into the event. Log failures do not change the
operation's result or prevent cleanup.

No rendering quality, frame rate, resolution, codec, numerical tolerance,
deadline, isolation setting, retry allowance, provider or infrastructure is
changed. The code remains native data-only rendering, not user-code execution.
Timing is diagnostic evidence, not a faster-render claim. Root/browser checks,
actual image comparisons and native-worker release proof remain pending.

The previous trace remains in
`creativesos-browser-qualification-eec937d3b2e34f3589f35e5003d73bd3`.
The separate editor release `4af98a7b316f77e8b5488dbf9e363439529b6a9d`
deployed through run `33707159720`; its public release identity and migration
parity were read separately. This diagnostic candidate is not included there.
