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
