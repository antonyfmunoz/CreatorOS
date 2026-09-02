# CutStudio in-page private render preview

Status: candidate under qualification; no competitor-parity claim.

## Field discovery and fix

On production release `41c441d1ede1e310232678ea3a2814c6e531f4bf`, the signed-in
private project `creativesos-cutstudio-gcp-e2e` created and completed three
parameterized render jobs. The new composition controls visibly advanced frames.
The Preview link fetched an authorized media descriptor and then called
`window.open` asynchronously. No preview tab appeared in the in-app browser.

The candidate replaces that popup-dependent path with a native private-video
dialog. It fetches fresh authorized access on opening, supports playback/seek/
volume through the native player, has an explicit Close control, displays access
or media errors, and provides a retry that refreshes private access. Closing
unmounts the media and drops its URL from component state. No sharing link or
public asset promotion is created.

The existing mobile/desktop frame-export journey now also opens the actual
encoded video, checks dimensions and duration from loaded media, closes it,
exercises a denied access response, and retries successfully. Its deadline and
all exact-frame, format and authorization assertions remain intact.

Local qualification on 2026-09-01: all four selected browser journeys passed
(mobile and desktop, programmable motion lifecycle and private still/preview
workflow), in 5.1 minutes. This includes real media decoding, exact output pixels,
three still formats, denied access, retry and revoked-collaborator access. Earlier
failed iterations are not counted as passing evidence. Full protected checks and
deployment of this candidate remain separate gates.

## Animation capture

The fixed-viewport animation renderer already waits for a completed frame.
It now captures that exact viewport rather than repeating locator stability
checks for every frame. Animation timing validation also rejects negative
duration/frame-rate pairs and rates outside 1–60. This is not a measured
competitive-speed claim; full output and workflow qualification remain required.

## Production batch evidence (preceding release)

- Web release `41c441d1ede1e310232678ea3a2814c6e531f4bf`: ready, release_ready,
  exact 120/120 migration parity. Protected deploy run `33581184353` succeeded.
- GCP executions `creativesos-cut-worker-kvdw8`, `creativesos-cut-worker-bn76l`,
  `creativesos-cut-worker-blcwh`: completed successfully, one task each.
- Render jobs `392f7d1f-b2b3-41a2-996d-90b1a4f77357`,
  `4a6bd177-865a-408c-b0d4-ac5fe3161ccd`,
  `43a9e0a5-20f6-4d51-a3ed-bf8d997e1c0c`: visible as render-ready in the private
  project after distinct A/B/C headline submission.
- Independent download, decode and visual review of those exact three finished
  artifacts remains a separate field-verification gate. Server/UI completion
  alone is not substituted for that proof.
