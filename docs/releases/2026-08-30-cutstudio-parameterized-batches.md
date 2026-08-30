# CutStudio parameterized composition batches release candidate

Date: 2026-08-30

## Outcome

- Resolves declared text, number, color, select and boolean parameters with
  required, type, select-option and numeric-bound validation.
- Rejects unknown parameters and bindings outside the explicit text,
  transform and bounded style allowlist.
- Creates up to 20 named composition variants in one owner/editor action.
- Persists each variant as its own editable declarative composition while
  retaining source-composition, batch and variant-index provenance.
- Uses a project-scoped PostgreSQL advisory lock and caller idempotency key so
  a retried request returns the original variants without duplication.

## Local evidence

- TypeScript passes.
- The focused programmable-runtime suite passes 12 tests, including exact
  binding resolution, limits and unknown-parameter rejection.
- Mobile and desktop browser journeys pass against a disposable database with
  all 115 migrations.
- The journeys create three variants, prove each exact bound headline, reload
  durable state and replay the same idempotency key without creating copies.

## Honest boundary

This release candidate proves the provider-independent batch authoring and
data contract. It does not claim final encoded-frame parity, native
Lottie/Rive/Three playback, isolated executable compositions or external
model quality. Protected CI, merge, deployment and exact-production smoke
remain required before this candidate is production-qualified.
