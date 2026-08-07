# CreativesOS federation baseline

These documents lock the product-side rules before the CreativesOS bridge grows.
They implement the portfolio decision: **native capability + external capability
+ UMH coordination**. They do not authorize UMH to write the CreativesOS
database directly.

## Canonical identity

| Identifier | Meaning |
| --- | --- |
| `creativesos` | Canonical projection/product and protocol identifier |
| `CreativesOS` | Canonical user-facing product name |
| `CreatorOS` | Legacy repository and deployment alias only; never use in new protocol, UI, or planning identifiers |
| `umh` | Private coordination/control-plane product identifier |

## Required reading order

1. [Product Constitution](PRODUCT_CONSTITUTION.md)
2. [Canonical Federation Contract v1](CANONICAL_FEDERATION_CONTRACT_V1.md)
3. [Tenant and Authority Matrix](TENANT_AUTHORITY_MATRIX.md)
4. [Capability Registry](CAPABILITY_REGISTRY.md)
5. [Private Pilot Workflow](PRIVATE_PILOT_WORKFLOW.md)
6. [Release Baseline](RELEASE_BASELINE.md)

## Change rule

Any new federation command, event, provider adapter, AI feature, or reusable
intelligence feature must name its tenant, local authority, consent basis,
retention rule, capability state, and proof path before implementation.
