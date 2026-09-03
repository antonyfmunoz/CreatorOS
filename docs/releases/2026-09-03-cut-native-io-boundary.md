# Native media input and diagnostic boundary

## Scope

The probe already restricted network protocols; native FFmpeg render/analysis
calls did not. They also included raw stderr in failed job details and inherited
the application's full environment. Those are concrete native-media boundaries,
not missing provider credentials.

- Apply `file,pipe` immediately before **every** FFmpeg `-i`, including later
  inputs. Refuse a caller-supplied protocol policy override. Existing callers
  supply materialized private files or generated lavfi/PNG inputs; their output
  paths, filters, frame counts and media quality remain unchanged.
- Both media probes and render processes receive only the established host,
  font and temporary-directory environment settings. They do not inherit
  database/provider credentials or `FFREPORT` automatic log destinations.
- Close unused stdin. Preserve cancellation, actual child-close confirmation,
  bounded progress parsing and the existing successful loudness-analysis output.
- Failed child processes return fixed messages and a numeric exit/category,
  never raw private filenames, paths, metadata, argument lists or stderr tails.

The [FFmpeg protocol contract](https://ffmpeg.org/ffmpeg-protocols.html#Protocol-Options)
is input-scoped. This patch is **not** a filesystem sandbox, arbitrary filter/code
execution service, global network firewall, fleet admission limit or protection
against every native-decoder vulnerability. Local nested file references and
decoder isolation require their own stronger boundary. Other application media
and Broadcast pipelines have not been claimed as covered by this CutStudio patch.

## Candidate evidence

The first focused run passed 23 tests across five files. It includes real child
exit/cancellation, actual credential-free child environments, opaque failures,
stdin closure, real H.264/AAC output, progress, successful loudness analysis,
generated PNG sequence colors, and direct/nested HTTP rejection on the second
input. An independent unwrapped FFmpeg request proves the loopback test server
is reachable; the wrapped process then makes zero requests. No provider is used.

Full root, browser, protected CI, exact image and public release qualification are
pending for this candidate. No performance deadline or pixel tolerance changed.

## Prior release observations retained, not overwritten

PR 173's exact `0ebbb735e409c7a78e387bf5dcdf96e607f0b7ca` local run passed
787 root tests, types/build/bundle, actual owned-process shutdown and real
Lottie/Rive checks. The 16-case browser run passed 15 and failed one desktop
native-session test at its unchanged 45-second deadline. Its retained receipt
does contain exact animation/text pixel results and closed shared context/browser
assertions, but the test timed out and **remains failed**. Evidence root:
`creativesos-browser-qualification-7df3d3d3e4fa480fad7fecdbb08c3037`.

Protected Verify `33724300249` passed 787 root tests and 382 mobile/desktop
journeys, with 24 existing desktop skips and no reported retries. CodeQL passed.
PR 173 merged at `efed8e7ada67a0ffb4cf26be3e8e745faad6b7ab`. Its application
deployment `33725833600` was still running at the 07:19 UTC checkpoint.

The existing native job was updated image-only to
`sha256:e508f0fd89ac61ab341b4824e4aa509985fd4643bd7ec550eda0c1f84a33ecc9`.
Before/after receipts preserve CPU, memory, task count and all non-image policy.
A fresh private production job `664e5058-2b00-444f-868a-98b8787eb1ca` on this
exact image passed with the still-live PR 171 app `12642a1d...`. This is **not**
proof of the pending PR 173 public app deployment. Evidence root:
`native-text-production-20260903071205483`.

The artifact is independently decoded H.264 1280x720, 30 frames/one second with
AAC, three wrapped text lines, visible changing Lottie/Rive and the authored
source offset (geometry IoU .9911102331, unchanged threshold >.97). Anonymous
access returned 401; the prior private fixture was unchanged and the owned
qualification session ended. Management evidence independently verifies the
exact execution image and successful completion.

Completion was 178,706 ms, inside the original 180-second gate but with little
margin. Earlier 252,650/254,280 ms failures remain failed; one later pass is not
a reliable latency distribution or competitive performance claim. Exact logs
show 164,295 ms from submission to worker-start, 1,986 ms Node uptime at that
event, and approximately 13 seconds from claim to finish. The ~162-second
pre-Node difference is a cross-system timing estimate, not proof of a specific
platform cause. The image starts Node directly, without an npm/tsx launcher.

No new execution service, paid warm capacity, budget, account or provider changes
are included. Executable source preview/render remains an explicit open product
and infrastructure gate; this hardening does not establish Remotion parity.
