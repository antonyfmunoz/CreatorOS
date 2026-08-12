# CreativesOS incident response

## Severity

- **SEV-1:** account takeover, credential exposure, cross-tenant disclosure,
  destructive corruption, or complete production outage.
- **SEV-2:** major feature outage, payment/entitlement inconsistency, delivery
  backlog, or degraded privacy processing without confirmed disclosure.
- **SEV-3:** isolated defect with a safe workaround and no material data risk.

## First response

1. Name one incident lead and record the start time.
2. Preserve logs, request identifiers, deployment identity, and database state.
3. Contain the fault using the smallest reversible action: disable the affected
   capability, pause a worker, revoke one credential, or roll traffic back.
4. Do not delete evidence or rotate every secret without determining scope.
5. Confirm tenant boundaries, financial effects, and privacy impact separately.
6. Communicate facts, affected scope, mitigation, and the next update time.

## Recovery and closure

Prove readiness, migrations, critical journeys, queue reconciliation, and data
integrity before restoring normal operation. Record root cause, contributing
conditions, customer impact, evidence, corrective actions, owners, and due
dates. A SEV-1 or SEV-2 remains open until recurrence prevention is verified.
