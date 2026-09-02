# CutStudio production artifact verification

Checked 2026-09-01 Pacific / 2026-09-02 UTC. This is bounded production evidence,
not competitor parity or public arbitrary-code execution approval.

## Deployed identity

- Protected production deployment `33586826827` succeeded for immutable web
  source `1be110e0d6989f4583b2cadcd83eda6fd6768796`.
- `/api/ready` reported verified clean source, `ready`, `release_ready`, no
  release blockers and exact 120/120 migration parity.
- Signed-in project `25b876b7-0f16-41f3-af20-c8002fc0d2f3` opened its completed
  private renders through the new in-page dialog, without popup dependence.

## Three independently verified variants

The earlier parameterized batch ran on the preceding immutable GCP worker image.
The new web release displayed those same completed artifacts. Private object
reads through the storage SDK, with credentials held only in process memory,
retrieved the exact objects observed in each preview. No bucket policy or public
access was changed. Browser asset bundling failed; that failed download is not
counted as artifact evidence.

| Variant | Job | Object | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| A | `392f7d1f-b2b3-41a2-996d-90b1a4f77357` | `4a0ce2e1-f822-48c0-b21c-79a5eba1ae49` | 1364893 | `421c62191b9b576e15245067b58fc0680a3d99d2a0174391b0930a4e9d4a0342` |
| B | `43a9e0a5-20f6-4d51-a3ed-bf8d997e1c0c` | `525c0e95-e077-4114-afaa-f3d93cdfccf0` | 1338347 | `2873fd7e3e82ba4e9e93b072840b1c8f53fb404afa035bf6d82af7cc75cd2a35` |
| C | `4a6bd177-865a-408c-b0d4-ac5fe3161ccd` | `df0ba17d-a392-4591-9fee-60464016248b` | 1338761 | `144c0ae2d4d1804372cd3bb31a605357cf0ba7ae24556bd22f02aa301f62c2d6` |

All three independently decoded as H.264 1920x1080, 30 fps, exactly 90 video
frames / 3 seconds, with AAC audio. Frame 30 was visually reviewed and contained
the correct respective A/B/C headline. Decoded frames 0, 30 and 60 and the
machine-readable receipt are retained locally under
`C:/tmp/creativesos-production-variants-1be110e/`.

The live application downloaded PNG frame 30 of variant A to the normal Downloads
folder. Its full-resolution decoded pixels matched frame 30 independently
decoded from the stored MP4 exactly. This is stronger than a successful HTTP
response or a render-ready label. Mobile/desktop permission and format enforcement
were separately covered by the protected browser qualification.

## Follow-up candidate

The local code-runtime candidate passed 15 unit tests and its complete isolated
artifact suite, including odd-sized stills at frame 107999 of a one-hour timeline,
bounded range output, mixed soundtrack timing, actual video decoding, network and
metadata denial, deadline termination, cancellation and container cleanup.
Long timelines do not increase the per-request 600-frame, pixel-frame, output or
deadline limits. Audio/range/player changes require their own protected release.

The isolated runtime itself merged in `e9fdf8c` after protected checks, but is
still not connected to public application render jobs. Hardened production
execution, admission/dispatch/recovery, application integration, broad media
compatibility and locked competitor-quality/performance benchmarks remain open.
