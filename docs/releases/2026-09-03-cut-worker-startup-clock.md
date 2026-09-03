# Native worker startup clock

## Why

The private production render on application `f3648cbc6d1fb3152648acfb093bbafbef021544`
produced the expected text, Lottie and Rive artifact on immutable worker image
`sha256:1c0117030049ea6428035416e2451e4264a8a62c4a7343692e09ac07ae324ad4`,
but completed after 252,650 ms. Its original 180-second qualification gate remains
failed; later artifact inspection does not erase that result.

Execution `creativesos-cut-worker-kbcfz` was created at 06:00:36 UTC. The
application's worker-start event appeared at 06:04:33.838943 UTC, claim at
06:04:34.385074 UTC and completion event at 06:04:45.547361 UTC. These observations
locate most delay before work, but cannot distinguish container provisioning from
Node's static module imports. Cloud execution state timestamps alone do not
establish the exact cause.

## Change

The existing `cut.worker.start` event now adds integer `processUptimeMs`, sampled
with `process.uptime()` before recovery or claiming work. Unlike a timer created
inside `main`, this elapsed clock includes static module loading. It measures
process elapsed time, not CPU usage or platform queue time. Compare it with the
same execution's management timestamps; do not compare unrelated attempts.

No environment, credentials, filenames, asset contents or extra identity fields
are emitted. No topology, capacity, provider, timeout, admission or render-quality
setting changes. A clock does not fix latency or prove competitive performance.

## Qualification boundary

Entrypoint tests mock only database/work functions, capture the actual startup
event and preserve the demo/qualification refusal. They check clock conversion,
event-before-recovery order, one-job behavior, cleanup and environment omission.
Full exact-source checks, worker-image release and a fresh production timing
observation are required separately; none is claimed by adding this file.
