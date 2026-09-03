# Media job cancellation across child-process gaps

Candidate work; not deployed or qualified yet.

The first real-SQL run at `5d4a470` failed the waiting-heartbeat expiry check.
The new SQL clock comparison had mixed an existing UTC-without-timezone column
with a timezone-aware database clock. The correction explicitly converts the
clock to UTC for those columns; it does not change schema or relax the test.
The next receipt includes the actual database timezone. This first failure is
retained in `media-lease-exact-20260903T034833-media.log.errors`.

The corrected SQL run at `68db8b9` passes with America/Los_Angeles as the
database timezone. Protected Core `100621409553` passes all 834 tests but fails
TypeScript's nullable-token narrowing across an async callback. Capturing the
validated token as an immutable local fixes that typing/ownership issue; no test
or database assertion changes. Full qualification of that correction is pending.

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
Renewal takes the job row lock before evaluating expiry against the database
clock, including when another transaction locks but does not change the row.
The checksum stream waits for its actual close before source cleanup.
Terminal success and failure writes use the same guarded row-lock transaction as
rendition publication; expiry checks use the database clock after lock waits and
again before commit. Aborted attempts cannot overwrite a durable cancellation.

Rendition and probe metadata publication now takes the durable job row lock and
checks the live, uncancelled attempt before committing. A local abort during the
transaction rolls it back. HLS object keys include the attempt token, so an old
worker cannot overwrite a newer attempt's fragments. Unreferenced storage cleanup
after lost publication remains a separate lifecycle concern.

New tests retain the original deadlines and assert real decoder termination plus
no later child start. Actual isolated-database tests contend for the exact row lock
while cancelling or reassigning the job, and check valid commits, wrong-token and
expired-lease denial plus abort rollback. These tests have not run at this checkpoint.
The renewal fixture also holds a real unchanged row lock until the lease expires
and asserts that the waiting heartbeat cannot bring it back to life.
This does not claim fleet-wide admission or full CutStudio parity.

Further review found recovery only ran at worker startup. Every ordinary polling
tick now recovers expired uncancelled claims before admitting queued work; any
still-local old attempt is aborted without releasing its slot early. Explicit
cancellation is never re-queued. A new isolated real-timer test starts with a live
lease, lets it expire after startup, and requires recovery by a later ten-second
poll without restarting the worker. Qualification of this addition is pending.

The retry endpoint also used a read-then-unconditional update. It now atomically
checks owner, original attempt, retryable state and remaining attempt budget.
Duplicate or stale retry requests return conflict instead of clearing a newer
claim. New real-SQL tests require one concurrent winner and reject stale,
wrong-owner and exhausted-budget retries. These additions are pending tests.
Claim admission and automatic recovery also enforce the same attempt budget.
Exhausted interrupted/queued jobs become terminal failures rather than looping
forever. The real database test covers both states and retains the attempt count.
