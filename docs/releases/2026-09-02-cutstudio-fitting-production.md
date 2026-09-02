# Private font and automatic fitting: production field receipt

Exact public source `41e6ca1efe725b87ba43c7b664dc5f17badf5a63` passed production
workflow `33600893309`. Readiness independently reported a clean, verified build
`20260902T071932Z-965393b33cc3` and all 120 expected migrations present.

In the signed-in private test project, a licensed Noto Sans font was uploaded
through the file chooser. The original kinetic composition was saved as revision
5 with a 190-unit requested font, minimum 18, automatic fitting and maximum two
lines. These settings and the private font selection survived a complete reload.
The preview visibly shrank the text and used the private font family.

After applying the saved composition, the portrait export completed:

- Job `95e9cc90-abf3-4021-9c9e-57828ebf3d2d`.
- Private artifact `ff43b67c-501a-4912-a74a-8e681c4e0320`.
- Cloud Run execution `creativesos-cut-worker-r9wkg`, one successful task.
- Worker source equals the public source; immutable image digest
  `sha256:3db38c71ade34a98a776888079adcf601808f811b1aa25e554ef595a5d322a69`.
- Independent conditional R2 read: 295150 bytes, SHA-256
  `eda199fb76b21a1515fae088f716d3a1dcfa5a1371dd6bd97358998b61068bcb`.
- Decoded H.264: 406x720, square pixels, 30 fps, 90 frames, exactly 3 seconds;
  AAC soundtrack also 3 seconds. Browser playback independently showed the same
  dimensions, duration and loaded state.
- Decoded frame 30 was visually reviewed: the entire longer title occupies two
  lines without clipping, inside its authored blue card. Letterboxing belongs
  to the landscape source footage, not an incorrect sample-aspect ratio.

Local evidence is in `B:/CreativesOS-task-artifacts/production-fitted-text-41e6ca1`.
No signed URL, provider credential or private source contents are committed.
This proves this production typography flow, not public TSX execution or broad
Remotion quality/performance parity.
