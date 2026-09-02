# CutStudio isolated TSX runtime qualification

Status: local prototype qualified; protected qualification pending. Not exposed
to application users and not a production/parity completion claim.

Local image `sha256:bd9e88783c1dd86166dbb0f839b8faea10aabf45c8dc4ceb5263007183074cd2`
produced real React/TSX composition frames and a 30-frame 320x180 H.264 MP4.
The independent FFmpeg checks verified frame-dependent colors and translated
geometry. A separate direct PNG verified transparent background and an
input-bound color. Relative TSX module imports and the native frame/context SDK
were used by those renders, rather than a placeholder/static artifact.

The host inspected each container's actual configuration. The runtime separately
checked effective capabilities, syscall filtering, no-new-privileges and
loopback-only interfaces. Internet, cloud-metadata and file-read attempts were
denied; a looping capsule hit the real host timeout; a separate looping capsule
received actual cancellation. Both removed the exact container. Five unit tests
passed and the pinned runtime dependency audit reported zero vulnerabilities.

Synthetic output/receipts live locally under
`runtimes/cut-code/qualification-output/` (not versioned). The dedicated CI workflow
rebuilds, tests actual outputs/boundaries and retains its own seven-day artifacts.
It does not relax or replace the application's existing protected checks.

Remaining: production execution architecture and image qualification, durable
dispatch/cancellation and asset custody, tenant admission/cost accounting,
application preview/render integration, broader media/codec/dependency support,
determinism coverage, operator recovery/security review, and side-by-side
competitor benchmarks. See the runtime README for the exact bounded contract.
