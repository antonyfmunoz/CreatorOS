# Animation source-time consistency candidate

Review found that native Lottie seeking treated delivery frames as source frames,
while preview added the file in-point to an API that already applies it. Native
compilation also discarded animation layer source offsets. These are fidelity
gaps, not provider configuration requirements.

Preview and native rendering now share seconds-to-source-frame conversion with
the asset's own frame rate. Seeking is relative to the player's in-point and
repeats the playable source span, matching the preview's existing loop intent.
Rive keeps its seconds-based seek API and receives the authored source offset.
An optional EDL animation offset preserves legacy snapshot hashes: no new default
field is injected into old or zero-offset graphics. Files containing less than
one playable Lottie frame fail validation instead of entering a zero-frame player.

The normal layer editor now exposes source offset in composition frames for video,
audio, Lottie and Rive, with the equivalent seconds shown beside the frame rate.
The new full workflow test edits that control, saves and reloads it, checks the
actual preview transform, exports private video, and compares decoded geometry
against an independently drawn reference. Another account must not read the still.

Qualification is pending. Pure tests cover rate conversion, looping, fractional
rates, malformed timing, compiled offsets and absent legacy defaults. An actual
native browser test compares decoded pixels from equivalent animations authored
at 30 and 60 FPS with different in-points and a nonzero source offset. Full authoring
preview/export field evidence, protected tests and production qualification remain
required. This is not a Remotion-parity claim.

Initial focused qualification: 19 tests in four files passed (animation timing,
execution-source validation, Lottie policy, and immutable render snapshots).
This result does not substitute for the pending actual browser/export checks.
