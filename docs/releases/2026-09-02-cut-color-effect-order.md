# Native color-effect ordering candidate

The composition preview applies base brightness/saturation and then all enabled
color effects in authored order. Native export previously selected only the first
`color_matrix` effect, used YUV additive brightness, and applied extra amount-based
contrast/saturation multipliers before the base controls. Those are different
operations; scalar motion correctness does not establish color-effect fidelity.

This candidate shares existing declarative defaults with the preview, implements
sRGB midpoint contrast before brightness/saturation, and retains every enabled
color effect in order after the base controls. Contrast uses the RGB lookup or
16-bit matrix path where possible and retains alpha independently. Inputs above
the native helper's supported zero-to-eight multiplier range fail explicitly;
this does not establish arbitrary-range filter support. No user-authored native
filter text is accepted.

Qualification adds raw RGBA cases for contrast, combined and animated controls,
and actual saved composition preview/export cases with repeated/reversed color
effects, disabled effects, legacy amount defaults and translucent cards. Existing
one-byte raw RGB, exact alpha, two-byte preview-oracle and four-byte encoded
preview/export tolerances are unchanged. Full execution is pending.

Scope is color-only stacks. Ordering relative to spatial/overlay effects, blur,
shadows, glow, noise, chroma key, projected 3D, HDR and production behavior remain
open. This is not a Remotion parity claim.

References: [CSS contrast definition](https://www.w3.org/TR/filter-effects-1/#contrastEquivalent),
[FFmpeg RGB lookup filters](https://ffmpeg.org/ffmpeg-filters.html#lut_002c-lutrgb_002c-lutyuv).

## Qualification and resource follow-up

The initial full root passed 656 tests after correcting an iterator syntax
incompatibility with the existing TypeScript target (the target was not changed).
Twenty-two raw control combinations passed the existing RGB and exact-alpha
bounds. The complete eight-case browser run passed seven checks but failed the
desktop cinema workflow at its unchanged 180-second limit: both batch jobs were
still encoding. The trace showed ongoing frame progress, not an EOF hang. All
color comparisons passed on both devices. The failure is retained at
`B:/CreatorOS-cut-color-effects/test-results/creativesos-browser-qualification-42b6fdaab790427ab09a4ec53a6ba373`.

A separate baseline desktop cinema run passed in 2.9 minutes with retained
trace. Its native worker was observed with hundreds of threads; independent
raster decoders use automatic pools by default. Raster inputs now set one
decoder thread before their individual input, without changing source-video
decoding, filter-graph scheduling or output encoder settings. An eight-input
RGBA frame-hash comparison passed against automatic decoding, and delayed-alpha
EOF/final-frame tests passed at 24/30/60 fps. A follow-up desktop cinema run
passed in 2.5 minutes with the original workflow deadline, at
`B:/CreatorOS-cut-color-effects/test-results/creativesos-browser-qualification-9d32996cac814e5b8fa58a76c83007ea`.
These are individual owned runs, not a causal whole-workflow speedup claim or a
competitor benchmark. Broad repeat and protected qualification remain required.

The original resource wrapper incorrectly returned one after a successful
baseline run because Windows PowerShell had not retained the child handle;
the browser report and retained trace show its actual pass. A separate exit-23
probe verified the handle correction. The original sampler could adopt old
processes whose parent PID was reused; subsequent sampling filters by process
creation time. Do not use the original whole-tree aggregates as owned CPU proof.

Native effect values outside the supported multiplier range are now rejected
when applying/validating an EDL, before admitting render work. Added browser
coverage requires a 400 response and unchanged project revision. Reversed-effect
cards now share identical inputs/base controls and must visibly differ in both
preview and export. These additional checks and the final root are pending.

References: [per-input option scope](https://ffmpeg.org/ffmpeg.html#Description),
[decoder thread option](https://ffmpeg.org/ffmpeg-codecs.html#Codec-Options).

The expanded twelve-case run passed ten checks and failed both ordered-effect
checks before pixel comparison: saving the additional unsupported composition
made the test's unscoped player locator match two independent players. Evidence
is retained at `creativesos-browser-qualification-f36c01eeae4b49dc9767a6022330c492`.
The test now selects the explicitly named RGB proof composition, not the first
matching player. Both compositions and the rejection/revision checks remain.
This is a test-target correction, not a successful color comparison; the exact
candidate must pass again. Root qualification passed 657 tests before this
locator-only correction.

The corrected candidate `9595c8b992c39327371aa32ab6ddf2c9dcf1ffe2` passed all
twelve cases in 7.4 minutes with no retries, timeout changes or tolerance changes.
Evidence: `creativesos-browser-qualification-dcc9ed9e2a87461faf1ef6d4526d61f8`.
Each device retained 32 base samples (maximum channel difference 3) and 32
ordered-effect samples (maximum 4, within the unchanged encoded-output bound).
The actual mobile preview and native frame 44 were also viewed. Exact protected
checks and production promotion remain distinct requirements.

Protected run `33673101414` completed successfully but retained one desktop
audio-preview retry: 178 mobile passes, 153 desktop first-attempt passes, one
desktop flaky case and 24 existing skips. It is not a clean first-attempt run.
The original trace records a startup baseline of -25.1 dBFS, followed by stable
quarter-gain readings of -32.9/-33.0 dBFS. The original test accepted any first
meter window above -30 as its baseline. The new prerequisite decodes the actual
fixture tone and requires the preview baseline to reach within one dB of that
source, before retaining it. The existing 10–14 dB attenuation, mute and restore
bounds are unchanged. Repeat qualification is required; no production audio
gain behavior is changed by this test correction.

The first calibrated six-case repeat passed five cases but the first mobile
case reached the end of the old 12-second fixture before its gain assertions
finished. Its trace shows -21.1 dBFS baseline followed by -60 at `0:12 / 0:12`.
The timeline correctly stops at its end; forcing the media element's loop flag
does not override that contract. The fixture now lasts 60 seconds, longer than
the unchanged 45-second test deadline, without forcing loop. Evidence remains
at `creativesos-browser-qualification-3964eab1c2554ebea0909330b4f0e7de`.
