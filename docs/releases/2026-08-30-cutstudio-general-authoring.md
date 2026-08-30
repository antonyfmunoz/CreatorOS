# CutStudio general authoring release candidate

Date: 2026-08-30

## Outcome

- Replaces template-only motion controls with normal-user layer creation,
  duplication, deletion, ordering, timing, transform, style, transition,
  keyframe and effect authoring.
- Replaces finishing-node-only workflow controls with capability selection,
  node creation/removal, provider/model/prompt/position editing, cycle-safe
  typed connections, connection removal and named-output authoring.
- Preserves parameter bindings when bound text is edited and persists the
  complete manifest/graph through existing revision-checked, tenant-scoped
  routes.
- Keeps model execution provider-pending and executable compositions isolated;
  this release does not simulate external inference or run untrusted code.

## Local release evidence

- TypeScript check passes.
- The complete unit/integration suite passes: 125 files and 502 tests.
- The production client build and distribution-worker dry run pass within the
  enforced bundle budgets.
- Mobile and desktop focused browser journeys pass against a disposable
  database with all 115 migrations.
- The journey proves visual layer/keyframe/effect persistence, graph node/edge/
  output persistence, cross-business private-asset rejection and reviewer
  mutation denial.

Protected CI, merge, production deployment and exact-release smoke are required
before this release candidate is called production-qualified.
