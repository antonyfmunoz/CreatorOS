# CreativesOS production objectives

These objectives define the initial operating envelope. They are release
guardrails, not a promise that a third-party provider can meet the same target.

| Signal | Objective | Alert threshold |
| --- | --- | --- |
| Application availability | 99.9% over 30 days | two failed readiness checks or five-minute error rate above 1% |
| First-party API latency | p95 below 750 ms over 15 minutes | p95 above 1,000 ms for 10 minutes |
| Mutation error rate | below 0.5% excluding expected 4xx | above 1% for 10 minutes |
| Database readiness | 100% for active machines | any failed database readiness check |
| Delivery queue age | under 5 minutes | oldest ready job above 10 minutes |
| Dead-letter work | zero unreviewed critical jobs | any new critical dead-letter job |
| Privacy deletion | execute within 24 hours after grace period | due request older than 24 hours |
| Backup recovery point | 24 hours initially | last verified backup older than 30 hours |
| Backup recovery time | restore verification below 4 hours | no successful restore drill in 90 days |

Provider delivery, model inference, transcription, and payment objectives must
be measured separately so external outages never hide first-party health.
