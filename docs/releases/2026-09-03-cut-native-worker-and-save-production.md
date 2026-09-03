# Native CutStudio: saving and private-worker field evidence

## Exact public and worker identities

- Public source: `824485a33efeb2edffc5d73c8a7c768aa4490f0e`.
- Build: `20260902T235408Z-d00aa531d391`; fingerprint
  `d00aa531d391cc8a13df1000608ec66c8d8339a5a95948ca589fbfb463add249`.
- Public release/readiness returned 200, identity verified, clean source,
  120/120 migrations, `release_ready`, no release blockers. This health response
  is not a claim that every end-state feature is implemented.
- Protected deploy `33694995263` completed. It had 359 browser passes, **one
  mobile two-tab recovery retry**, 24 existing desktop skips, and two passing
  post-deploy public checks. The retry remains recorded, not a clean-run claim.
- Native worker source `9f2bc4031fda227b6cc6709f16f1da717b0bbfad`; image
  `us-central1-docker.pkg.dev/creativesos-504623/creativesos-render/cutstudio@sha256:e1fc3d0dc0d0b87a2b68b0d781cb0062e485033aa652968447e4cae22909a231`.
  Worker and app identities differ because the later changes were editor-only.

## Actual owned private field test

The existing approved owner signed in through the production Clerk test helper.
No account was created. The already-owned synthetic project was reused; no
public media was posted. Credentials stayed in process memory and only the
new test session was signed out.

1. V1 gain .25 saved at revision 2. Reverting a subsequent .20 edit back to .25
   before debounce returned to Saved, left rendering enabled and issued no
   redundant revision. This reproduces the real prior release's saving failure.
2. The UI submitted that exact timeline. A later edit of the same private test
   project changed gain to .50 without changing the submitted snapshot.
3. Job `8c6dddc8-da6a-4360-a6ea-a6da73af1f68` was created at
   `2026-09-03T00:00:23.303Z`, claimed at `00:03:21.915Z` by
   `cut:creativesos-cut-worker-bn79k:0:0:1`. Cloud logs tie that job to the same
   worker and report one processed job at `00:03:25.263500Z`. The execution
   descriptor independently identifies the immutable image above.
4. The original three-minute field wait **failed while the job was running**.
   Cloud startup consumed most of the wait. Later inspection fetched this same
   completed job; it did not submit a replacement or erase the latency failure.
5. Private artifact `ad922021-e854-4ca6-89dc-307c97ef9f9f` decoded as 406x720
   H.264, 30 fps, 90 frames, 3 seconds, with one three-second AAC stream.
   Measured output/source RMS ratio: **0.24976265523623478**. Its snapshot hash
   matches `5b7bfb735ade72afc54e6ec05203da4991530b1fe53c08b432672a283f6326a3`.
6. Frame 45 contained blue `[0,0,254]` at the content center and black `[0,0,0]`
   in the expected portrait containment bars. The first inspection incorrectly
   expected a whole-frame mean to be blue; that failed oracle and its output
   were retained before checking actual content and bar pixels separately.
7. The output is 46,341 bytes, SHA-256
   `0dc1e3f2400a846ce8f0c04e49cc0a7e43926ee07c465b2bcf8655291db3d82d`.
   Anonymous access returned 401; reopening the project retained the later .50
   edit. The submitted artifact still contains .25, not the newer draft.

Local receipts under `B:/CreativesOS-task-artifacts`:
`production-native-824485a3-20260903000002132` (original timeout),
`native-existing-job-20260903000521430` (incorrect whole-frame oracle),
`native-existing-job-20260903000709089` (independent output pass),
and `native-release-824485a-complete.log`. Private files remain private.

## Remaining work

The artifact and saving behavior passed; cold-start latency did not meet the
three-minute test wait. No warm service, additional paid topology, IAM or secret
configuration was introduced to hide this gap. The two-tab test read two copies
before the latest async storage write settled. Its exact-value assertion is
being corrected without changing deadlines. A separate held-lock regression
also reproduced the UI incorrectly calling the prior copy current; this needs
its own source/protected/release qualification.

This native EDL path does not execute arbitrary TSX. Public source editor,
player and isolated service, larger media/3D workloads and authorized current
Remotion comparisons remain open. A correct private synthetic artifact is not
a claim of blanket competitive parity.
