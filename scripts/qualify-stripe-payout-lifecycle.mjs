import { randomUUID } from "node:crypto";
import postgres from "postgres";
import Stripe from "stripe";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error("Payout qualification is restricted to a Stripe test-mode secret key");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const qualificationId = randomUUID();

try {
  const [paymentAccount] = await sql`
    select user_id, stripe_account_id, status, payouts_enabled
    from creator_payment_accounts
    where status = 'enabled' and payouts_enabled = true
    order by updated_at desc
    limit 1
  `;
  if (!paymentAccount) throw new Error("No payout-enabled creator Stripe account is available");
  const balance = await stripe.balance.retrieve({}, { stripeAccount: paymentAccount.stripe_account_id });
  const availableUsd = balance.available.find((entry) => entry.currency === "usd")?.amount ?? 0;
  if (availableUsd < 100) throw new Error(`Connected account has only ${availableUsd} cents available; 100 required`);

  const payout = await stripe.payouts.create({
    amount: 100,
    currency: "usd",
    metadata: {
      creativesOsQualificationId: qualificationId,
      purpose: "creator_payout_lifecycle_qualification",
    },
  }, {
    stripeAccount: paymentAccount.stripe_account_id,
    idempotencyKey: `creativesos-payout-qualification-${qualificationId}`,
  });

  let evidence;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    const [ledger] = await sql`
      select provider_event_id, event_type, status, connected_account_id,
             amount, currency, processed_at, error_code, error_message
      from commerce_provider_events
      where provider = 'stripe'
        and provider_object_reference = ${payout.id}
        and event_type like 'payout.%'
      order by received_at desc
      limit 1
    `;
    const [history] = await sql`
      select provider_payout_id, stripe_connected_account_id, amount,
             currency, status, arrival_at, failure_code, failure_message, updated_at
      from creator_payout_events
      where provider_payout_id = ${payout.id}
      limit 1
    `;
    evidence = { ledger, history };
    if (ledger?.status === "processed"
      && history?.provider_payout_id === payout.id
      && history?.stripe_connected_account_id === paymentAccount.stripe_account_id
      && Number(history?.amount) === 1
      && !["failed", "canceled"].includes(history.status)) break;
  }
  if (evidence?.ledger?.status !== "processed"
    || !evidence.history
    || ["failed", "canceled"].includes(evidence.history.status)) {
    throw new Error(`Payout webhook/history qualification failed: ${JSON.stringify(evidence ?? null)}`);
  }

  console.log(JSON.stringify({
    status: "qualified",
    qualificationId,
    accountId: paymentAccount.stripe_account_id,
    payoutId: payout.id,
    providerStatus: payout.status,
    availableUsdBefore: availableUsd,
    evidence,
  }));
} finally {
  await sql.end({ timeout: 5 });
}
