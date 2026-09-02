# Media Cloud admission follow-through

Media Cloud used the same duplicate-only check before its asynchronous claim,
so overlapping selectors could overcommit its per-process capacity too. The
shared reservation helper now protects both processors, retaining their separate
active sets, identities, configured capacity and durable job lease rules.

The additional disposable-database fixture holds six real Media Cloud claims
against row locks. It requires two admitted requests and four untouched queued
rows with zero attempts, then re-admits queued work after slot release. A pending
source intentionally exercises the existing `asset_unavailable` failure before
any media binary, filesystem materialization or provider access. Every admitted
job must receive exactly one attempt, release its lease and free its slot.
Missing/completed claims and drain refusal are also covered. These failed-media
fixtures are not successful transcode proof: actual ingest/output browser
qualification remains a separate requirement.

Combined source `fa7d1ff` passed the disposable PostgreSQL proof on 2026-09-02:
two blocked claims, four untouched queued jobs, six expected unavailable-asset
rejections after readmission, one attempt each, released missing claims, and
preserved draining queue. Cut admission and existing cross-worker recovery also
passed; fixture leakage was zero. All 120 migrations qualified. The same source
passed 662 unit tests across 158 files, type checks, production build, bundle
budgets and Worker dry-run. Receipts: `cut-worker-admission-database-20260902T130246.log`
and `cut-worker-admission-root-20260902T130246.log` in the owned artifact folder.
Exact protected and native browser qualification remain separate requirements.

No cross-queue, tenant-wide or distributed CPU/memory cap is claimed. These are
per-processor admission guarantees, not a replacement for worker deployment
isolation, global scheduling or production capacity evidence.
