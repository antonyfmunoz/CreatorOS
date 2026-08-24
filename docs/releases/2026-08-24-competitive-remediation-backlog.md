# Competitive remediation backlog

Date: 2026-08-24

## Outcome

Competitive evidence now drives product execution rather than ending as a
report. Every failed required-parity capability creates governed remediation
work atomically with its immutable assessment.

## Lifecycle

- A failed verdict creates or reopens one tenant-scoped remediation lineage.
- The failure snapshot retains the product, capability, acceptance criterion,
  latest evidence note, failure count and assessment linkage.
- A priority-100 `product_gap` work item is synchronized into the Production
  Planner.
- Operators may move the remediation from open to in-progress to
  ready-for-retest and may assign, prioritize or schedule it.
- Manual resolution is rejected in both Benchmark Lab and Production Planner.
- Only a later passing locked assessment for the same product and requirement
  resolves the remediation and closes the planner work item.
- A subsequent failure reopens the same lineage instead of hiding history in a
  duplicate task.

## Evidence boundary

The lifecycle proves that observed product deficits cannot be silently
dismissed. It does not claim that any unperformed competitor comparison has
passed.
