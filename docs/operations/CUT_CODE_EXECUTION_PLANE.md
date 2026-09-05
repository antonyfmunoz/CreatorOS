# CutStudio executable composition plane

## Purpose

Declarative CutStudio compositions stay on the existing Cloud Run render plane.
Executable `sandboxed_tsx` compositions are a separate capability: the web
application persists and validates a source capsule, but it must never execute
that capsule or give it access to the database, private-object credentials,
application secrets, metadata endpoints, or the public network.

This document is the deployment contract for turning the already-qualified
`runtimes/cut-code` renderer into a production feature. The initial product
path is a user-approved local node (CLI first, optional desktop wrapper), not
a managed cloud worker. A URL, a container image, or an unchecked feature flag
is not evidence that this contract is met.

## Projection interface standard

CreativesOS is a standalone UMH projection, not merely a website. Every
durable CutStudio capability must be available through the projection's shared
capability contract and then presented through these first-class surfaces:

| Surface | Role in this capability |
| --- | --- |
| Web app | Main collaborative authoring, preview, review, billing disclosure and device selection experience. |
| Desktop app | Optional native workspace that wraps the same local-node capability with installation, pairing, file access and device controls. |
| CLI | The canonical local-node executable for headless workstations, CI, scripts and power users. It owns pairing, status, explicit job approval and local sandbox launch. |
| Versioned API | The authority for projects, authorization, durable jobs, device registry, receipts, artifacts and entitlements. No UI has a private-only backend path. |
| MCP | Narrow, user-authorized tools for an AI agent to inspect projects, prepare a bounded render request, query node status, and request (never silently approve) a local or managed render. |
| Automation/agent runtime | Delegated workflows built on the same API and policy contract; it cannot bypass device approval, rights checks, credits, concurrency or audit receipts. |

The interfaces are peers over one domain contract, not six separate products.
The web application does not get a privileged render path; the CLI is not an
unbounded shell; and MCP never receives a raw Docker socket or long-lived
device credential. Each request carries an actor, projection/tenant scope,
idempotency key, policy decision and auditable result.

## Live baseline — 2026-09-04

The `creativesos-504623` project currently has:

- `creativesos-cut-worker`, a healthy Cloud Run Job for trusted render work;
- `creativesos-cut-dispatch`, a public HMAC-authenticated dispatcher for that
  job; and
- a reserved `creativesos-cut-code-runner` service account with **no project
  roles**, for a future opt-in managed fallback.

The normal worker has database and R2 credentials, ordinary egress, and a
two-hour task timeout. It is intentionally unsuitable for user-authored TSX.
Do not add `code_render` to that worker's capability list. No Compute Engine
VM has been created.

## Required topology

```
signed-in editor
      │ pairs a named, user-approved device
      ▼
CreativesOS local node (CLI first; desktop wrapper optional)
      │ authenticated, one-time lease + short-lived signed URLs
      ▼
CreativesOS API / durable job record
      │ returns only this device's approved work
      ▼
trusted local code-runner host
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

The host is user-approved local infrastructure; the child composition is not.
The host may hold a narrowly scoped, revocable device credential, but the child never sees that
credential, Docker socket, service-account token, source host paths, or an
upload credential. The local node makes outbound HTTPS requests only; it has no
inbound listener. If a managed fallback is later introduced, it must also have
no inbound public rule. Network access belongs to the host only; the child remains
`--network none` and the runtime must prove only loopback is visible.

## Minimum broker protocol

The API owns authorization, job state, accounting, cancellation, and final
artifact registration. The runner must not receive `DATABASE_URL`, R2 keys, or
general application credentials.

1. The API validates ownership, capsule source + lockfile, runtime limits, and
   per-owner admission before inserting a `code_render` job.
2. A paired local node presents an authenticated, replay-bounded claim request. The
   API atomically leases one eligible job and returns only its immutable
   runtime request, source download URL, and an output PUT URL scoped to one
   temporary private key.
3. The local node downloads the source, calls `renderIsolated`, and uploads the
   bounded artifact to that one key. The container remains networkless.
4. The runner posts the signed receipt. The API independently checks the
   artifact size/hash/media type, seals it to a fresh private key, inserts the
   native asset/lineage, and commits the job only while its lease is valid.
5. Failed, cancelled, timed-out, or stale attempts revoke their lease and
   delete temporary material. A late completion cannot resurrect a job.

## Local-node pairing and lifecycle

The first delivered boundary is a registry and availability protocol, not a
remote shell and not a render dispatcher. A signed-in owner creates a one-time
pairing code from CutStudio. The code is hashed at rest, expires in 15 minutes,
and is consumed atomically when a node claims it. Claiming produces a separate
random device credential; only its SHA-256 hash is kept by CreativesOS.

The CLI makes this lifecycle available without storing a general CreativesOS
API key:

```text
creativesos node connect <pairing-code> --name "Editing workstation"
creativesos node heartbeat --status ready
creativesos node work
creativesos node status
creativesos node disconnect
```

`connect` records a redacted device identity and capability declaration in the
API, then writes the device credential to `CreativesOS/cut-local-node.json`
inside the current OS user's profile. It does not print the credential,
transmit it to a container, or persist a developer API key. `heartbeat` is
sequence-numbered and an old/replayed heartbeat is rejected. `disconnect`
removes only the local credential; the owner must revoke the registry record
from CutStudio when a machine is lost, sold, or no longer trusted.

Revocation is immediate: CreativesOS marks any running `code_render` lease held
by that node cancelled, clears its lease deadline, and rejects all subsequent
node authentication. The isolated child has no network or platform credential;
it may finish local CPU work after its host is stopped, but it cannot renew,
upload an accepted result, or claim new work.

The API now exposes the broker boundary for a paired node: it can claim only
the owner-and-business-scoped `code_render` work for which it is eligible,
receives a five-minute lease, two short-lived private source reads, and one
temporary private output PUT URL. It renews the lease with bounded progress or
reports a failure. Completion is accepted only when the returned temporary key
matches the lease, the server independently confirms its type, size, and
SHA-256, copies it to a never-exposed private key, and commits the artifact
while the lease remains live. A late completion is rejected and its sealed copy
is removed.

`node work` claims at most one eligible job. It resolves the local Docker image
to an immutable SHA-256 image ID, downloads only the signed source archive,
runs the existing no-network/read-only/non-root harness, verifies the local
receipt, uploads only the bounded artifact to the single temporary URL, and
submits its hash to the broker. It does not run automatically, install a
package, accept an arbitrary image tag as the execution identity, or expose a
Docker socket to a container.

The broker changes the node from `ready` to `busy` in the same transaction as
the job claim. A `ready` heartbeat is rejected while that node holds a live
lease, so a second terminal invocation cannot create parallel work. Completion
or reported failure releases the node back to `ready`; expired-lease recovery
releases it only after confirming it has no newer live job and removes the
unaccepted temporary output.

This is still not a public execution claim: no live R2-backed field run or
release migration has been proven. The broker must not be bypassed by sending a
job or Docker access directly to a node.

The public-safe release-readiness record reports this capability as
`disabled`, `unconfigured`, or `configured`. If an operator sets
`CUT_CODE_EXECUTOR_ENABLED=true` without both a 32-character broker secret and
private R2 delivery, the release is gated as misconfigured rather than exposing
a button that can never complete a render. The readiness record contains only
state labels—never the secret, bucket name, account identifier, or signed URL.

## Desktop distribution boundary

`npm run desktop:package:dir` creates the Windows desktop artifact. The
Electron wrapper contains only the desktop shell and local-node CLI. The
isolated runtime is copied to `resources/cut-code-runtime` outside Electron's
application archive because Docker must read the real seccomp policy path on
the host. When packaged, the shell passes that path to the CLI through
`CREATIVESOS_CUT_CODE_RUNTIME_DIR`; when run from the repository, the CLI uses
the checked-out `runtimes/cut-code` directory instead.

The artifact deliberately excludes the server dependency tree and optional
native WebSocket acceleration module. Neither is needed for a browser shell
that invokes a built-in-only CLI, and excluding them avoids inheriting a native
compiler requirement into a user workstation installation. A local unpacked
build is a packaging qualification, not a released installer: production
distribution still requires a signed Windows installer, release provenance,
and the field-test evidence below.

## Field-test sequence

Run this only after the local-node migration is applied and the private R2
asset plane is configured in the same deployed environment. The signed source
and output URLs are deliberately unavailable against a local-only production
configuration.

1. Start Docker Desktop on the trusted workstation and build the pinned runtime
   from `runtimes/cut-code`. Confirm the resulting image ID begins with
   `sha256:`; do not configure a mutable tag as the runtime identity.
2. In CutStudio, create a one-time node code, then on that workstation run
   `creativesos node connect <code>` and `creativesos node heartbeat --status ready`.
   Confirm the CutStudio node list shows the expected device, OS, capability,
   and recent heartbeat.
3. Create a fresh assistant-authored TSX source package and matching lockfile,
   save an isolated composition, then queue its bounded local still export.
4. Run `creativesos node work`. Confirm that it claims no more than one job,
   resolves an immutable image ID, creates no public inbound listener, and
   reports a completed artifact back to the project.
5. Download the private artifact through the ordinary authenticated CutStudio
   media route. Confirm its hash, dimensions, type, and source lineage match
   the receipt and composition request. Verify the temporary upload key is no
   longer readable and the final private key differs from it.
6. Repeat once with a deliberately invalid source or stopped Docker engine.
   Confirm the job records a bounded failure; then revoke the node and confirm
   it cannot renew, complete, or claim another job.

Keep the migration receipt, image digest, isolated-harness output, successful
artifact receipt, rejection/revocation response, and deployment identity with
the release. This is required field evidence, not a checklist that can be
replaced by code review.

## Compute profile and billing guardrail

The qualified local child profile is one vCPU, 2 GiB memory, PID limit 256,
read-only root, and a 120-second wall-clock deadline. The user's device bears
the compute cost and can set its own availability, concurrency, and resource
limit. The CLI must show those settings and require explicit pairing; it must
never become a remote shell or silently consume local resources.

## Managed fallback commercial rule

Managed rendering is an optional paid utility, never a platform-funded default.
Before a user can send an executable composition to managed compute, the API
must reserve that user's purchased render credits or a metered allowance using
the existing payments ledger. It must release the reservation when dispatch
does not start, reconcile measured duration/compute profile after completion,
and block dispatch when no entitlement remains. A user who keeps a local node
paired consumes no managed-render credit.

The product surface must disclose the destination before confirmation:

- **This device** — uses the paired local node; no CreativesOS render charge.
- **Managed render** — shows the render profile, estimated credit/usage cost,
  included allowance if any, and the user's remaining balance before work
  starts.

The platform may charge a margin for managed execution, but it must not promise
unlimited code rendering or absorb open-ended Chromium/FFmpeg/GPU usage. The
same admission ledger covers retries: a duplicate dispatch cannot consume twice,
and a platform-caused failed start releases its reservation.

Before a managed, billed fallback is ever created, retain these receipts:

- exact host and child image digests;
- service-account IAM policy proving no database/R2 secret access;
- network/firewall evidence proving no inbound public access;
- a real signed-in code-capsule render, private download, cancellation, and
  stale-completion rejection; and
- a cost alert tied to the GCP billing account and a configured hard
  concurrency limit.

## Explicit non-claims

This plane is not enabled merely because Compute Engine is enabled, the reserved
runner service account exists, or a local harness passes. Until device pairing,
the broker, local-node job lifecycle, immutable images, and field evidence are
all present, the product must continue reporting executable code as unavailable.
