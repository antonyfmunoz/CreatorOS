# CutStudio private preview recovery

The owner authoring panel no longer tries to decode every private library
font's JSON media descriptor as a font. Its existing composition font loader
owns active-manifest loading, readiness and error reporting. Unused library
fonts do not require an eager request, while selected fonts still use actual
authenticated private bytes.

Image decode failures now have a visible in-canvas error. Replacing an image,
video or audio source mounts a fresh source-scoped element/error state; media
replacements also dispose the previous audio graph. Successful media loading
or playback clears a prior transient playback error.

New browser scenarios use real private assets and a synthetic 503 for the first
source, then replace it through the authoring controls. They check actual image
dimensions, video/audio playback, draft preservation and absence of page errors.
The audio case observes real Web Audio post-gain samples and verifies that a
quarter-volume setting changes the measured signal accordingly. The existing
private-typography journey additionally checks no eager unused-font request,
actual selected-font loading and denial to the other seeded account.

Local qualification passed: `npm run verify` (595 tests, type/build/bundle and
Worker dry-run gates), plus 18 focused desktop/mobile journeys: ten creative
draft scenarios, two complete private typography journeys and six source-recovery
cases. The initial new font-permission assertion incorrectly expected 404; the
established asset endpoint returns 403. The final assertion checks that exact
403, the exact access-denied JSON and `no-store`, without changing server policy.
The final 18-case run passed in 2.6 minutes. Protected qualification remains
pending at this checkpoint.
This is owner-side authoring recovery, not a claim that the separate shared
workspace has full composition editing, that every resource buffers the player
clock correctly, or that public executable TSX jobs are enabled. Those remain
explicit roadmap items.
