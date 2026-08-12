import { randomUUID } from "node:crypto";
import postgres from "postgres";
import Stripe from "stripe";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error("Dispute qualification is restricted to a Stripe test-mode secret key");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const qualificationId = randomUUID();
const marker = `stripe-dispute-${Date.now()}`;
const startedAt = new Date();

async function waitFor(label, inspect, attempts = 40) {
  let lastResult;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    lastResult = await inspect();
    if (lastResult?.complete) return lastResult.value;
  }
  throw new Error(`${label} did not complete; last state: ${JSON.stringify(lastResult?.value ?? null)}`);
}

try {
  const [paymentAccount] = await sql`
    select cpa.user_id, cpa.stripe_account_id, cpa.status,
           cpa.charges_enabled, cpa.payouts_enabled
    from creator_payment_accounts cpa
    where cpa.status = 'enabled'
      and cpa.charges_enabled = true
      and cpa.payouts_enabled = true
    order by cpa.updated_at desc
    limit 1
  `;
  if (!paymentAccount) throw new Error("No fully enabled creator Stripe account is available for qualification");

  const [buyer] = await sql`
    select id from users
    where id <> ${paymentAccount.user_id}
      and deleted_at is null
    order by id
    limit 1
  `;
  if (!buyer) throw new Error("A second provisioned user is required as the sandbox buyer");

  const fixture = await sql.begin(async (tx) => {
    const [product] = await tx`
      insert into products (
        user_id, payout_mode, status, product_type, billing_model,
        title, description, price, category
      ) values (
        ${paymentAccount.user_id}, ${"creator"}, ${"published"},
        ${"digital_download"}, ${"one_time"},
        ${"[Sandbox] Dispute lifecycle qualification"},
        ${"Provider-signed $1 Stripe Connect dispute and recovery qualification fixture."},
        ${1}, ${"Digital Asset"}
      )
      returning id
    `;
    const [order] = await tx`
      insert into orders (
        buyer_id, status, currency, subtotal_amount, total_amount,
        payment_provider, financial_status, idempotency_key
      ) values (
        ${buyer.id}, ${"pending"}, ${"usd"}, ${1}, ${1},
        ${"stripe"}, ${"open"}, ${marker}
      )
      returning id
    `;
    await tx`
      insert into order_items (
        order_id, product_id, title_snapshot, unit_amount, quantity,
        product_type_snapshot, billing_model_snapshot
      ) values (
        ${order.id}, ${product.id}, ${"[Sandbox] Dispute lifecycle qualification"},
        ${1}, ${1}, ${"digital_download"}, ${"one_time"}
      )
    `;
    await tx`
      insert into entitlements (
        user_id, product_id, source_order_id, resource_type, resource_id, status
      ) values (
        ${buyer.id}, ${product.id}, ${order.id}, ${"product"}, ${String(product.id)}, ${"active"}
      )
    `;
    await tx`
      insert into creator_earnings_allocations (
        order_id, seller_user_id, stripe_connected_account_id, currency,
        gross_amount, platform_fee_amount, creator_net_amount, status
      ) values (
        ${order.id}, ${paymentAccount.user_id}, ${paymentAccount.stripe_account_id},
        ${"usd"}, ${1}, ${0}, ${1}, ${"paid"}
      )
    `;
    return { productId: product.id, orderId: order.id };
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: 100,
    currency: "usd",
    payment_method: "pm_card_createDispute",
    payment_method_types: ["card"],
    confirm: true,
    transfer_data: { destination: paymentAccount.stripe_account_id },
    transfer_group: fixture.orderId,
    metadata: {
      orderId: fixture.orderId,
      creativesOsQualificationId: qualificationId,
      purpose: "dispute_lifecycle_qualification",
    },
  }, { idempotencyKey: `creativesos-qualification-${qualificationId}` });
  if (paymentIntent.status !== "succeeded") {
    throw new Error(`Qualification PaymentIntent finished with status ${paymentIntent.status}`);
  }
  const chargeId = typeof paymentIntent.latest_charge === "string"
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id;
  if (!chargeId) throw new Error("Qualification payment did not produce a charge");

  await sql`
    update orders set
      status = 'paid',
      provider_payment_reference = ${paymentIntent.id},
      updated_at = now()
    where id = ${fixture.orderId}
  `;
  await sql`
    update creator_earnings_allocations set
      payment_intent_reference = ${paymentIntent.id},
      updated_at = now()
    where order_id = ${fixture.orderId}
  `;

  const opened = await waitFor("Stripe dispute-open reconciliation", async () => {
    const [event] = await sql`
      select provider_event_id, event_type, status, error_code, error_message
      from commerce_provider_events
      where provider = 'stripe'
        and event_type in ('charge.dispute.created', 'charge.dispute.updated')
        and order_id = ${fixture.orderId}
        and received_at >= ${startedAt}
      order by received_at desc
      limit 1
    `;
    const [state] = await sql`
      select o.financial_status, o.disputed_amount, e.status as entitlement_status,
             cea.status as allocation_status, cea.reversed_amount
      from orders o
      join entitlements e on e.source_order_id = o.id
      join creator_earnings_allocations cea on cea.order_id = o.id
      where o.id = ${fixture.orderId}
      limit 1
    `;
    return {
      complete: event?.status === "processed"
        && state?.financial_status === "disputed"
        && state?.entitlement_status === "revoked"
        && state?.allocation_status === "disputed"
        && Number(state?.reversed_amount) === 1,
      value: { event, state },
    };
  });

  const charge = await stripe.charges.retrieve(chargeId);
  const chargeTransferId = typeof charge.transfer === "string" ? charge.transfer : charge.transfer?.id;
  const groupedTransfers = chargeTransferId ? null : await stripe.transfers.list({
    destination: paymentAccount.stripe_account_id,
    transfer_group: fixture.orderId,
    limit: 100,
  });
  const transferId = chargeTransferId ?? groupedTransfers?.data.find((candidate) => {
    const sourceTransaction = typeof candidate.source_transaction === "string"
      ? candidate.source_transaction
      : candidate.source_transaction?.id;
    return sourceTransaction === chargeId;
  })?.id;
  if (!transferId) throw new Error("Destination charge did not produce a transfer");
  const reversalList = await stripe.transfers.listReversals(transferId, { limit: 100 });
  const recovery = reversalList.data.find((reversal) =>
    reversal.metadata?.purpose === "dispute_risk_recovery"
      && reversal.metadata?.orderId === fixture.orderId
  );
  if (!recovery || recovery.amount !== 100) {
    throw new Error("The provider-side creator transfer was not fully recovered");
  }

  // Stripe can close a test dispute before the returned funds are available
  // for a compensating transfer. This official test payment method creates an
  // immediately available platform balance without touching real money.
  const restorationBuffer = await stripe.paymentIntents.create({
    amount: 10_000,
    currency: "usd",
    payment_method: "pm_card_bypassPending",
    payment_method_types: ["card"],
    confirm: true,
    metadata: {
      creativesOsQualificationId: qualificationId,
      purpose: "dispute_restoration_available_balance",
    },
  }, { idempotencyKey: `creativesos-qualification-${qualificationId}-balance` });
  if (restorationBuffer.status !== "succeeded") {
    throw new Error(`Restoration balance fixture finished with status ${restorationBuffer.status}`);
  }

  const disputes = await stripe.disputes.list({ charge: chargeId, limit: 1 });
  const dispute = disputes.data[0];
  if (!dispute) throw new Error("Stripe did not create the expected test dispute");
  await stripe.disputes.update(dispute.id, {
    evidence: { uncategorized_text: "winning_evidence" },
    submit: true,
  });

  const won = await waitFor("Stripe dispute-win reconciliation", async () => {
    const providerDispute = await stripe.disputes.retrieve(dispute.id);
    const [event] = await sql`
      select provider_event_id, event_type, status, error_code, error_message
      from commerce_provider_events
      where provider = 'stripe'
        and event_type = 'charge.dispute.closed'
        and provider_object_reference = ${dispute.id}
        and received_at >= ${startedAt}
      order by received_at desc
      limit 1
    `;
    const [state] = await sql`
      select o.financial_status, o.disputed_amount, e.status as entitlement_status,
             cea.status as allocation_status, cea.reversed_amount
      from orders o
      join entitlements e on e.source_order_id = o.id
      join creator_earnings_allocations cea on cea.order_id = o.id
      where o.id = ${fixture.orderId}
      limit 1
    `;
    return {
      complete: providerDispute.status === "won"
        && event?.status === "processed"
        && state?.financial_status === "dispute_won"
        && state?.entitlement_status === "active"
        && state?.allocation_status === "paid"
        && Number(state?.reversed_amount) === 0,
      value: { providerStatus: providerDispute.status, event, state },
    };
  }, 60);

  const restorations = await stripe.transfers.list({
    destination: paymentAccount.stripe_account_id,
    transfer_group: fixture.orderId,
    limit: 10,
  });
  const restoration = restorations.data.find((transfer) =>
    transfer.metadata?.purpose === "dispute_won_restoration"
      && transfer.metadata?.creativesOsDisputeId === dispute.id
  );
  if (!restoration || restoration.amount !== recovery.amount) {
    throw new Error("The creator funds were not restored after the dispute was won");
  }

  console.log(JSON.stringify({
    status: "qualified",
    qualificationId,
    orderId: fixture.orderId,
    productId: fixture.productId,
    paymentIntentId: paymentIntent.id,
    chargeId,
    disputeId: dispute.id,
    transferId,
    recoveryReversalId: recovery.id,
    restorationTransferId: restoration.id,
    restorationBufferPaymentIntentId: restorationBuffer.id,
    opened,
    won,
  }));
} finally {
  await sql.end({ timeout: 5 });
}
