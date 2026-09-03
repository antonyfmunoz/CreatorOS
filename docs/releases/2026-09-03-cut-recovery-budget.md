# Bounded native-render recovery and deduplicated manual retries

Candidate only. Qualification, migration and exact production rollout are not
yet established. This is not complete parity or stable-latency evidence.

Native CutStudio jobs receive three automatic claim attempts, persisted in the
database. Recovery never resets that budget. A database claim trigger covers
older worker binaries during a mixed-version rollout; the application also
rejects cancelled or exhausted claims before dispatch. Existing historical work
is backfilled as at least one attempt, not an invented historical total.

One recovery implementation serves owner polling and the ordinary worker tick.
Expired live jobs are requeued only if uncancelled and within budget; cancellation
and exhaustion are terminal. The periodic worker can recover without restarting.
External-mode dispatch still follows existing app requests: this does not add a
new paid scheduler, capacity, service or warm instance.

Repeated retry requests for a single failed job return one uniquely linked child
job. Replaying a retry does not need another quota slot. The failed original is
retained; a failed child can itself be explicitly retried. This does not claim
global atomic admission across every distinct job-creation endpoint.

Actual database qualification checks all three claims, renewal accounting,
mixed-version rejection, cancellation, scoped and legacy recovery, eight
concurrent retry requests, authorization/state/quota boundaries and recovery by
the real ten-second worker timer. Existing publication and two-slot admission
tests remain unchanged. No provider call is used by this fixture.

Image deployment and artifact field tests remain separate evidence. The existing
Google Cloud management session currently requires reauthentication. Dispatch
failure budgets, orphan cleanup, full fleet cost admission and latency remain
distinct work; this claim budget is not a cloud billing cap.
