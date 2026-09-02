# Consolidated isolated code runtime candidate

This candidate combines the independently tested runtime, motion and export
work with capsule-local video layers, on top of the merged private-preview
release `1be110e`. It replaces the stacked PR 119/121/122 candidates without
removing their retained test evidence or weakening any protected gate.

## Implemented and locally qualified

- Pinned React/TSX capsule compilation; relative modules and private images/fonts.
- Per-job non-root, capability-dropped, no-network, read-only container with
  Chromium sandbox, explicit syscall policy, bounded CPU/memory/output, deadline
  and cancellation cleanup. No application credentials or Docker socket inside.
- Local/global frames, sequence/repeat/freeze, numeric/color keyframes, easing,
  cubic Bezier timing, physical springs and repeatable keyed variation.
- PNG/JPEG/WebP stills, quality, exact MP4 ranges and reproducible hashed image
  sequences. Full-request/source/output receipt binding and tamper rejection.
- Private imported MP4/WebM `FrameVideo` timing. Actual MP4 qualification proves
  red/blue source seeking, a six-frame encoded output, offset, doubled speed and
  repeat behavior. Local media remains muted; this is not code audio mixing.
- React effect failure rejects completion. Network/metadata/file denial, actual
  infinite-loop timeout, actual abort and exact-container cleanup still pass.

Twelve unit tests pass. The final actual-container harness passes all prior
checks plus the video retiming tests. Protected Linux evidence already passed
the motion and export candidates; this consolidated candidate requires its own
exact-source protected run and full application regression checks.

## Not claimed

This is not public application code execution, an approved multi-tenant
production sandbox, arbitrary npm compatibility or Remotion parity. No provider
credentials, privileges, paid topology or network access were expanded.

Remaining implementation includes a hardened production image/compute boundary,
tenant admission, durable dispatch/cancel/recovery, private asset exchange,
application code editor/preview, audio mixing, broader codec/VFR/dependency/3D
support and larger-workload qualification. Locked quality/time/cost comparisons
remain `not_benchmarked`. The existing app must continue to report code execution
as unimplemented until an end-to-end production path is actually qualified.
