# Native CutStudio lease-bound publication

Candidate only. No production worker-image change or parity claim.

Progress, successful results, transcript/project updates and failure state now
serialize on the durable job row. They check the same uncancelled lease after
obtaining the lock and again before committing. A local abort or lease expiry
during the write rolls the transaction back. Database failures are not silently
converted into success. Native heartbeat renewal locks before checking UTC
database time, so a delayed heartbeat cannot revive an expired attempt.

The worker's progress cancellation is tied to its attempt token and captured
controller; an older callback must not abort a newer attempt. Heartbeats do not
overlap and stop affecting controllers after their attempt is disposed. Queued
jobs with cancellation requested cannot be claimed. The drain timestamp uses
the driver's supported serialized timestamp instead of a raw SQL Date value.

New real SQL qualification covers terminal commit, wrong-token/pre-abort denial,
rollback after abort, actual cancellation/reassignment/unchanged-row expiry lock
conflicts, renewal, cancelled claims, transaction-error propagation and expiry
after a terminal write. It is included in the protected worker resilience suite.
Existing actual-child cancellation tests remain. Qualification is pending.

Open separately: artifact/lineage cleanup after a database outage, native retry
budgets and continuous recovery, end-to-end latency stability, scaled admission,
public executable-code service isolation/authority and current competitor
benchmarks. The saved Google Cloud management login currently requires
reauthentication; an app merge alone must not be described as a worker rollout.
