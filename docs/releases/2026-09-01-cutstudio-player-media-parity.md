# CutStudio media-player and composition-ratio closure

Status: implementation under qualification; not a competitor-parity verdict.

## Native behavior

- Audio and video layers follow composition timing, source offsets, pause,
  exact-frame seek, loop and playback speed. Mute and master volume are explicit;
  one lazily activated Web Audio context per player preserves layer gain up to 2.
- Portrait, square and landscape canvases use the declared dimensions. Text
  scales with canvas width, and private composition fonts load into the player.
- Composition batch exports preserve the declared ratio within bounded
  720p/1080p/2160p rendition dimensions rather than assuming landscape. Batch
  admission enforces the same two-hour per-render duration limit as the editor.
- The player API supplies a composition-scoped media template. Each request
  rechecks active collaboration, active composition membership, project media
  association, asset ownership, private visibility and readiness. Code packages
  and unrelated project assets are not exposed by that media route.

## Local qualification

- 133 unit-test files / 546 tests pass; TypeScript, production build and bundle
  budgets pass. Worker generation, type checking and deploy dry run pass.
- The expanded programmable-cinema journey passes on mobile and desktop (2/2),
  including audio seek/rate/mute, portrait canvas dimensions, a real downloaded
  720x1280 MP4, private shared media/fonts, unrelated code-package denial and
  collaborator revocation.
- Source secret scan is clean (998 files).

Protected CI, the exact web and worker release, and live output evidence remain
separate gates. These local results do not imply production deployment.

Arbitrary React execution, generalized imported Three scenes, distributed
frame rendering and direct human-reviewed competitor benchmarks are not closed
by this increment.
