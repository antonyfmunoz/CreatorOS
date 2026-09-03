# Media job cancellation across child-process gaps

Candidate work; not deployed or qualified yet.

The prior worker cancelled only currently registered decoder children. A
cancelled job downloading its source, or moving between children, could therefore
start more work afterward. Lease-heartbeat callbacks also looked up jobs by ID,
rather than retaining the exact attempt they were checking.

This candidate retains one abort controller per admitted attempt, including while
its claim is pending. Source materialization receives the signal. Every managed
decoder receives the same signal, rejects a pre-aborted start, and waits for actual
child exit before rejecting a cancelled run. Cancellation stays latched until the
attempt finishes. The shared read-only lease watcher detects remote cancellation,
reassignment, expiry and failed database checks independently of lease renewal.
Renewals cannot revive expired leases; delayed callbacks only affect their own
still-active attempt. Success also requires a live uncancelled matching lease.

Rendition and probe metadata publication now takes the durable job row lock and
checks the live, uncancelled attempt before committing. A local abort during the
transaction rolls it back. HLS object keys include the attempt token, so an old
worker cannot overwrite a newer attempt's fragments. Unreferenced storage cleanup
after lost publication remains a separate lifecycle concern.

New tests retain the original deadlines and assert real decoder termination plus
no later child start. Actual isolated-database tests contend for the exact row lock
while cancelling or reassigning the job, and check valid commits, wrong-token and
expired-lease denial plus abort rollback. These tests have not run at this checkpoint.
This does not claim fleet-wide admission or full CutStudio parity.
