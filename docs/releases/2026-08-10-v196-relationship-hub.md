# CreativesOS Relationship Hub release — v196

## Delivered scope

Release `v196` establishes the CreativesOS-owned Relationship Hub as the
standalone relationship and conversation kernel. It includes canonical
tenant-scoped identities, consent, conversations, bindings, messages,
attachments, receipts, notes, tasks, tags, assignments, merge review, agent
authority, evidence-linked AI suggestions, verified-owner voice workflows,
provider events, durable delivery jobs, retention, audit, and secret-safe data
export.

The native CreativesOS inbox is the reference adapter and remains usable when
UMH or an external provider is unavailable. Connected-inbox comment and DM
keyword rules use the same governed automation kernel as native rules. The
Instagram professional-account adapter implements exact OAuth scope selection,
single-use state, encrypted long-lived tokens, signed webhooks, DM/comment
normalization, public and private replies, receipts, rate/error
classification, and scheduled token renewal. It remains fail-closed until the
Meta app credentials and provider review are supplied.

AI suggestions are proposal-only and evidence-linked. External effects require
review under the business agent-authority policy. Cloned voice requires owner
attestation, explicit consent, provider voice validation, synthetic-media
disclosure, private storage, and owner approval of AI-authored scripts.

## Verification evidence

- Full suite: 46 test files and 139 tests passed.
- TypeScript check and production client/server build passed.
- An empty PostgreSQL 16 database applied all 57 migrations and verified all
  40 required release tables.
- Local HTTP field qualification synchronized a legacy native conversation,
  rendered inbound content, delivered one outbound reply, retried the same
  idempotency key without duplication, and completed note, task, tag,
  lifecycle, agent-policy, identity-merge, and secret-safe export workflows.
- Release commands for `v195` and corrected `v196` completed successfully.
  `v196` fixed the new-account channel-display race and added Instagram token
  renewal before the final browser pass.
- Both production machines run the same `v196` image and pass the Fly health
  check.
- Production `/api/ready` reports `ready`, a ready database, configured private
  R2 delivery, configured native Relationship Hub, and configured AI copilot.
- Anonymous Relationship Hub summary and export requests return `401`; an
  unknown webhook connection returns `404` without processing content.
- The authenticated production browser loaded the unified inbox, provisioned
  and displayed the native channel, opened and returned from the native chat
  picker, selected every queue, exercised search, and loaded the connected-
  inbox keyword automation builder.

## Provider activation still required

These are external qualification gates, not incomplete native product paths:

- Instagram: Meta app credentials, webhook verify token, app review, account
  connection, and live DM/comment round-trip field tests.
- Cloned voice: ElevenLabs credential, user-owned provider voice enrollment,
  and live generation/delivery field tests.
- Realtime room transcription and speaking AI participant: the separately
  declared LiveKit agent runtimes and their provider credentials.

Production readiness exposes each missing provider as `provider_pending` and
does not silently claim that it is available.
