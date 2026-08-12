# CreativesOS v237 Stripe financial recovery qualification

Release v237 hardens the Stripe Connect financial lifecycle against real
provider timing, retry and transaction-pool behavior discovered by production
sandbox field tests. No live-mode funds were used.

## Shipped

- Destination-transfer discovery by source charge and canonical order transfer group.
- Creator transfer reversal when a dispute opens or is lost.
- Idempotent compensating transfer when a dispute is won.
- Explicit `restoration_pending` creator obligation when provider funds are not yet available.
- Background retry of failed and stale-claimed dispute events, including crash recovery.
- Metadata-before-write duplicate protection with per-attempt Stripe idempotency keys.
- Transaction-scoped production migration advisory lock, preventing pooled-session lock leakage.
- Ten-minute deployment migration timeout and repeatable dispute, payout, balance and connected-account qualification tools.

## Production evidence

- Fly v237 completed its release migration and both machines passed health checks.
- `/api/ready` remained `release_ready` with zero application blockers.
- Stripe test order `0e457c91-3eaa-4a79-b85e-fddcbc7fec1f` completed an actual dispute-created and won lifecycle.
- The connected creator transfer `tr_3U3SqMPYAgbSUeFT17ikK1dz` was recovered by reversal `trr_1U3SqlPYAgbSUeFTqAUCj15s` and restored by transfer `tr_1U3SqvPYAgbSUeFTmxgChuWL`.
- Signed close event `evt_1U3SquPYAgbSUeFTKkP8cIDT` is processed; access is active, creator allocation is paid, reversal debt is zero, and the recovery audit found zero failed dispute events and zero pending restorations.
- Test payout `po_1U3T8FBFJI099HyyxwCX5WmJ` delivered a signed Connect event and persisted its failed status and reason in creator payout history. The connected account is enabled, but its default Stripe sandbox bank is `errored`; Stripe denies the platform permission to replace a Standard account's bank.

## Remaining operator/provider gates

- The creator must replace the errored sandbox bank from the connected Stripe account dashboard; then rerun the successful $1 payout qualification.
- Choosing a non-zero `STRIPE_PLATFORM_FEE_BPS` remains an economic decision.
- Meta/X and additional approved distribution credentials/reviews, OpenAI quota, realtime transcription/agent workers, cloned voice, UMH-side pairing, legal approval, and the Chrome DevTools performance connector remain external or decision gates.
