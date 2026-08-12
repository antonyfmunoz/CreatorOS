import postgres from "postgres";
import Stripe from "stripe";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

try {
  const [latest] = await sql`
    select o.id as order_id, o.provider_payment_reference, o.financial_status,
           o.disputed_amount, e.status as entitlement_status,
           cea.stripe_connected_account_id, cea.status as allocation_status,
           cea.reversed_amount
    from orders o
    join order_items oi on oi.order_id = o.id
    join entitlements e on e.source_order_id = o.id
    join creator_earnings_allocations cea on cea.order_id = o.id
    where oi.title_snapshot = '[Sandbox] Dispute lifecycle qualification'
    order by o.created_at desc
    limit 1
  `;
  if (!latest) throw new Error("No Stripe dispute qualification order exists");

  const paymentIntent = await stripe.paymentIntents.retrieve(latest.provider_payment_reference, {
    expand: ["latest_charge"],
  });
  const charge = typeof paymentIntent.latest_charge === "string"
    ? await stripe.charges.retrieve(paymentIntent.latest_charge)
    : paymentIntent.latest_charge;
  if (!charge) throw new Error("The latest qualification payment has no charge");
  const [dispute] = (await stripe.disputes.list({ charge: charge.id, limit: 1 })).data;
  if (!dispute) throw new Error("The latest qualification charge has no dispute");

  const transfers = await stripe.transfers.list({
    destination: latest.stripe_connected_account_id,
    transfer_group: latest.order_id,
    limit: 10,
  });
  const recoveryTransfer = transfers.data.find((transfer) => {
    const source = typeof transfer.source_transaction === "string"
      ? transfer.source_transaction
      : transfer.source_transaction?.id;
    return source === charge.id;
  });
  if (!recoveryTransfer) throw new Error("The destination transfer is unavailable");
  const reversals = await stripe.transfers.listReversals(recoveryTransfer.id, { limit: 100 });
  const recoveryReversal = reversals.data.find((reversal) =>
    reversal.metadata?.creativesOsDisputeId === dispute.id
      && reversal.metadata?.purpose === "dispute_risk_recovery"
  );
  const restorationTransfer = transfers.data.find((transfer) =>
    transfer.metadata?.creativesOsDisputeId === dispute.id
      && transfer.metadata?.purpose === "dispute_won_restoration"
  );

  const [closedEvent] = await sql`
    select provider_event_id, status, error_code, error_message, processed_at
    from commerce_provider_events
    where provider = 'stripe'
      and event_type = 'charge.dispute.closed'
      and provider_object_reference = ${dispute.id}
    order by received_at desc
    limit 1
  `;
  const [residue] = await sql`
    select
      (select count(*)::int from commerce_provider_events
       where status = 'failed' and event_type like 'charge.dispute.%') as failed_dispute_events,
      (select count(*)::int from creator_earnings_allocations
       where status = 'restoration_pending') as pending_restorations
  `;
  const residueEvents = await sql`
    select provider_event_id, event_type, status, provider_object_reference,
           error_code, error_message, updated_at
    from commerce_provider_events
    where event_type like 'charge.dispute.%'
      and status in ('failed', 'processing')
    order by updated_at
  `;
  const pendingRestorations = await sql`
    select cea.order_id, cea.status, cea.reversed_amount, cea.updated_at,
           o.financial_status, o.provider_payment_reference
    from creator_earnings_allocations cea
    join orders o on o.id = cea.order_id
    where cea.status = 'restoration_pending'
    order by cea.updated_at
  `;
  const stateQualified = latest.financial_status === "dispute_won"
    && Number(latest.disputed_amount) === 0
    && latest.entitlement_status === "active"
    && latest.allocation_status === "paid"
    && Number(latest.reversed_amount) === 0;
  const moneyQualified = recoveryReversal?.amount === 100
    && restorationTransfer?.amount === recoveryReversal.amount;
  const ledgerQualified = dispute.status === "won" && closedEvent?.status === "processed";
  const residueQualified = Number(residue?.failed_dispute_events) === 0
    && Number(residue?.pending_restorations) === 0;
  if (!stateQualified || !moneyQualified || !ledgerQualified || !residueQualified) {
    throw new Error(`Stripe dispute audit failed: ${JSON.stringify({ stateQualified, moneyQualified, ledgerQualified, residueQualified, latest, closedEvent, residue, residueEvents, pendingRestorations })}`);
  }

  console.log(JSON.stringify({
    status: "qualified",
    orderId: latest.order_id,
    paymentIntentId: paymentIntent.id,
    chargeId: charge.id,
    disputeId: dispute.id,
    recoveryTransferId: recoveryTransfer.id,
    recoveryReversalId: recoveryReversal.id,
    restorationTransferId: restorationTransfer.id,
    event: closedEvent,
    state: latest,
    residue,
    residueEvents,
    pendingRestorations,
  }));
} finally {
  await sql.end({ timeout: 5 });
}
