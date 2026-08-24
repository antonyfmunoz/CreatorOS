# Specialist-substitution parity enforcement

Date: 2026-08-24

## Outcome

CreativesOS no longer permits a comparison family to earn `parity_met` or
`connected_advantage_proven` from aggregate quality, speed, and handoff scores
alone. Each named comparison product now has a versioned, locked capability
contract. An independent reviewer must pass or fail every required capability
and ground every verdict in evidence present in both locked runs.

## Enforcement

- Twenty benchmark families generate product-specific required-parity
  contracts for every named comparison product.
- Missing, duplicate, unknown, or ungrounded capability verdicts are rejected.
- Any failed required capability forces `parity_failed`, even when aggregate
  metrics are perfect.
- Connected-system advantage is evaluated only after direct capability parity.
- Historical definitions and runs remain immutable; an older definition with
  no capability contract is superseded by a new version.
- The Benchmark Lab exposes the full contract and capability-level review
  state instead of hiding failures behind a composite score.

## Qualification

- `npm run verify`: 119 test files, 455 tests, TypeScript, production build,
  bundle budgets, and Worker dry-deploy qualification passed.
- `npm run verify:migrations`: 107 migrations replayed from empty; 218 required
  tables and 52 required columns passed.
- Targeted mobile and desktop Benchmark Lab field tests passed, including the
  deliberate rejection of an incomplete assessment.
- Secret scanning, Stitch-reference qualification, infrastructure checks,
  native mobile qualification, and dependency audit passed.

This release establishes the proof system. It does not claim that unperformed
human competitor runs have passed; those comparison outcomes remain
`not_benchmarked` until their locked evidence and independent review exist.
