# Native worker reservation race candidate

Overlapping dispatch queries can each read the same available slot count before
awaiting different queued rows. The individual job processor previously checked
only duplicate IDs before adding to its active set. The SQL lease prevents two
workers claiming the same job, but does not reserve a process-wide slot across
different job rows. Heartbeat clamping is not capacity enforcement.

The processor now synchronously checks/reserves the configured slot immediately
before its first await and refuses new reservations while draining. Existing
durable claims, queued rows, retry scheduling, per-job cancellation and the
existing finally-block release remain unchanged. No configured quota or deadline
is reduced. A controlled overlapping-selection test must observe at most two
reservations, no lost queued work and successful subsequent admission.

This is an independent admission correction, not the explanation for a legal
two-job cinema batch's earlier slow rendering. It enforces capacity within one
worker process; duplicated operator-configured worker IDs across processes,
cluster-wide tenant quotas, memory/CPU enforcement and scaled scheduling still
need their own guarantees. Full root, protected workflows and deployment remain
pending at this checkpoint.

## Local qualification

Source `bdd24ed` passed 660 unit checks across 157 files, type checking, the
production build, bundle budgets and Worker dry-run. A disposable PostgreSQL
database applied all 120 migrations and exercised the actual job processor:
six requests were held on real row locks; only two claims blocked and the other
four returned without acquiring a lease. All six subsequently completed through
the native highlights path. Duplicate/missing claims, a deliberate transcript
failure, later successful admission and draining refusal also passed. The
existing cross-worker lease/recovery checks passed and no fixture users leaked.

Receipts: `cut-worker-admission-database-20260902T123607.log` and
`cut-worker-admission-root-20260902T123607.log` in the owned task artifact folder.
The original wrapper run was interrupted by Windows PowerShell promoting the
deliberate error-path stderr record to a fatal launcher exception. Its isolated
database was stopped explicitly; that run is not a successful qualification.
The corrected wrapper preserves stdout/stderr independently and checks both
the actual child exit code and admission receipt. It does not suppress the
intentional failure log. Negative-control, browser and protected checks remain.

The negative control restored only the old duplicate-only reservation in a
separate detached worktree. The identical database proof failed at the intended
capacity assertion: **six blocked claims instead of two**. Its original nonzero
exit and assertion are retained in
`cut-worker-admission-negative-20260902T124030.log.errors`. The candidate worktree
was not changed by this experiment. Browser/protected/deployment gates remain.

The native browser repeat passed six checks and failed both cinema main renders
at the existing 60-second completion bound. Evidence is retained at
`creativesos-browser-qualification-6e40264806a54c838b94a3e3c2ec3331`. The mobile
job spent 44 seconds before entering multitrack encoding and reached frame four
at the deadline; desktop spent 33 seconds before encoding and remained at frame
zero. The failures are not waived. Admission correctness does not establish
adequate render resource behavior; bounded filter scheduling is being evaluated
separately without changing quality, job capacity or deadlines.

Combined Cut/Media admission and explicit filter-pool source `fa7d1ff` passed
all 120 migrations, both real SQL admission proofs, existing lease/recovery
checks and zero fixture leakage. Full root passed 662 tests across 158 files,
types, build, budgets and Worker dry-run. Retained receipts are the
`cut-worker-admission-{database,root}-20260902T130246.log` files. This does not
waive the earlier browser failure; the combined native repeat is still required.

The combined filter-pool repeat on `c463bfd` retained six passes and two cinema
deadline failures (5.8 minutes overall). Evidence:
`creativesos-browser-qualification-12580c331f51431e9de7a09a73ed56c0` and
`cut-worker-admission-browser-20260902T131304.log`. The graph-pool cap alone is
not an adequate resolution. Compiler scalar caching and job-scoped native
browser reuse are separate follow-up candidates; those require their own proof.
