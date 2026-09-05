# CutStudio executable composition plane

## Purpose

Declarative CutStudio compositions stay on the existing Cloud Run render plane.
Executable `sandboxed_tsx` compositions are a separate capability: the web
application persists and validates a source capsule, but it must never execute
that capsule or give it access to the database, private-object credentials,
application secrets, metadata endpoints, or the public network.

This document is the deployment contract for turning the already-qualified
`runtimes/cut-code` renderer into a production feature. A URL, a container
image, or an unchecked feature flag is not evidence that this contract is met.

## Live baseline — 2026-09-04

The `creativesos-504623` project currently has:

- `creativesos-cut-worker`, a healthy Cloud Run Job for trusted render work;
- `creativesos-cut-dispatch`, a public HMAC-authenticated dispatcher for that
  job; and
- a dedicated `creativesos-cut-code-runner` service account with **no project
  roles**.

The normal worker has database and R2 credentials, ordinary egress, and a
two-hour task timeout. It is intentionally unsuitable for user-authored TSX.
Do not add `code_render` to that worker's capability list.

## Required topology

```
signed-in editor
      │ authenticated request
      ▼
CreativesOS API / durable job record
      │ one-time lease + short-lived signed URLs
      ▼
trusted code-runner host (dedicated VM or equivalent)
      │ read-only source/request mount
      ▼
one disposable Docker container
  - network none                  - no capabilities
  - read-only root filesystem     - seccomp + no-new-privileges
  - non-root user                 - CPU/memory/PID/time limits
      │ only a bounded artifact + receipt
      ▼
CreativesOS API verifies receipt and seals private artifact
```

The host is trusted infrastructure; the child composition is not. The host may
hold a narrowly scoped broker credential, but the child never sees that
credential, Docker socket, service-account token, source host paths, or an
upload credential. A VM must have no inbound public rule. If it needs Internet
egress to reach the broker, that belongs to the host only; the child remains
`--network none` and the runtime must prove only loopback is visible.

## Minimum broker protocol

The API owns authorization, job state, accounting, cancellation, and final
artifact registration. The runner must not receive `DATABASE_URL`, R2 keys, or
general application credentials.

1. The API validates ownership, capsule source + lockfile, runtime limits, and
   per-owner admission before inserting a `code_render` job.
2. A runner presents an HMAC-authenticated, replay-bounded claim request. The
   API atomically leases one eligible job and returns only its immutable
   runtime request, source download URL, and an output PUT URL scoped to one
   temporary private key.
3. The runner downloads the source, calls `renderIsolated`, and uploads the
   bounded artifact to that one key. The container remains networkless.
4. The runner posts the signed receipt. The API independently checks the
   artifact size/hash/media type, seals it to a fresh private key, inserts the
   native asset/lineage, and commits the job only while its lease is valid.
5. Failed, cancelled, timed-out, or stale attempts revoke their lease and
   delete temporary material. A late completion cannot resurrect a job.

## Compute profile and billing guardrail

The qualified local child profile is one vCPU, 2 GiB memory, PID limit 256,
read-only root, and a 120-second wall-clock deadline. The host VM is a
separate operational choice: it must have enough headroom for Chromium and
FFmpeg plus one child, be capped at one concurrent child, and be stopped when
idle. It must not be introduced as an always-on unmetered instance.

Before the first billed runner is created, retain these receipts:

- exact host and child image digests;
- service-account IAM policy proving no database/R2 secret access;
- network/firewall evidence proving no inbound public access;
- a real signed-in code-capsule render, private download, cancellation, and
  stale-completion rejection; and
- a cost alert tied to the GCP billing account and a configured hard
  concurrency limit.

## Explicit non-claims

This plane is not enabled merely because Compute Engine is enabled, the runner
service account exists, or a local harness passes. Until the broker,
least-privileged host, immutable images, job lifecycle, and field evidence are
all present, the product must continue reporting executable code as unavailable.
