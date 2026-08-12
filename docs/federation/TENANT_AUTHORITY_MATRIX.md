# CreativesOS tenant and authority matrix

| Aggregate | Authoritative owner | Tenant / scope | Local authority | UMH role | Visibility / consent |
| --- | --- | --- | --- | --- | --- |
| User profile | CreativesOS | person | profile owner | observe approved public identity events | public fields explicit; private account data never exported by default |
| Post / story | CreativesOS | author + visibility policy | author; moderation policy | propose/coordinate only through signed command | public, followers, or private as selected |
| Content draft | CreativesOS | business tenant + author | authorized business operator | can create a local draft; outcome is durable | private until local publication approval |
| Campaign / metrics | CreativesOS | business tenant | business owner/admin/operator | can coordinate authorized creation and observation | private business operating data |
| Product / order / entitlement | CreativesOS | business tenant | seller/business and payment policy | observe outcomes; no payment mutation by default | buyer and payment data private |
| Creator payout account | CreativesOS + Stripe | creator principal | creator with Stripe onboarding | no direct provider credentials or payout control | financial data restricted |
| Community | CreativesOS | community workspace | community owner/admin under local policy | may observe approved, explicitly bound capability | members-only by default |
| Channel / message | CreativesOS | community + channel | community member subject to role/moderation | no direct message access by default | members-only; no cross-room leakage |
| Community room | CreativesOS | community + room | host/community manager | later: invoke declared room capability through local command ingress | recording/transcription/AI require granular consent |
| Room notes / actions | CreativesOS | community room | authorized room member/manager | later: reconcile approved summaries/actions only | members-only unless explicitly published |
| Asset | CreativesOS + object storage | owner/business/product entitlement | asset owner and entitled buyer | observe metadata only when approved | public or private; private reads short-lived and authorized |
| Federation command/event/outcome | CreativesOS | business tenant + scoped aggregate | local command handler and policy | dispatcher/reconciliation ledger | metadata minimization; payload follows aggregate policy |

## Non-negotiable authorization checks

- Authentication resolves a local principal before business, community, asset,
  or room access.
- Business authority does not imply access to every community workspace.
- Community membership does not imply access to business finances, drafts,
  orders, or payout accounts.
- Cross-product operations must validate business tenant, principal, optional
  community/workspace, signature, expiry, replay key, and local policy.
- External providers receive only the smallest authorization and data scope
  necessary for the selected adapter action.
