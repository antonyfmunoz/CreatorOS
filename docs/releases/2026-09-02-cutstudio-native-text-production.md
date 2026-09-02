# Native typography: real production export

Production deployment `33597373582` completed for source
`e41f1d9da774a483b63e5c7727ef92271af8a347` after protected qualification.
Live readiness reported verified clean-source identity and migration parity
(120 expected and actual migrations). This is an increment, not full parity.

The existing private three-second kinetic composition was reapplied through
the signed-in app so its EDL contained the new typography contract, then
rendered at 720p portrait/30 fps/draft. Nothing was publicly published.

- App render: `f98ff62f-76da-4b00-a61d-52db3a576aaa`.
- Private artifact: `7c766f2b-398c-41db-bb6d-afde17f67fc9`.
- Cloud Run execution: `creativesos-cut-worker-xvvsp`, successful, one task.
- Execution source label: the exact release above.
- Execution image: `sha256:01c2be2447232d6cc17dda7f178f27bb8359f3a3533fd8d74769540b5455237b`.
- Object bytes: 272667; SHA-256:
  `d32dae05c3136a0fb68e3ac7ba0fa6a4e97fe0e72e4a5e750b51b7d562d59e1c`.
- Independent private-object download and FFprobe: H.264 406 x 720, square
  pixels, 90 frames at 30 fps, exactly three seconds; AAC audio also three seconds.
- Signed-in browser: decoded 406 x 720, duration three seconds, ready for playback.
- Decoded frame 30 was viewed: the full `Turn attention into momentum` headline
  was readable, with its authored background, rather than the earlier clipped
  glyph strip. Source footage retains its deliberately letterboxed framing.

The download used exact-object, conditional private reads. No credentials,
signed URLs, private source bytes or public media links are included here.
This evidence does not cover automatic fitting or the isolated code runtime;
those changes require their own exact-release qualification.
