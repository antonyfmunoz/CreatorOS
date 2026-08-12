import { randomUUID } from "node:crypto";
import postgres from "postgres";
import Stripe from "stripe";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const startedAt = new Date();
const qualificationId = randomUUID();

try {
  const [paymentAccount] = await sql`
    select stripe_account_id, status
    from creator_payment_accounts
    order by updated_at desc
    limit 1
  `;
  if (!paymentAccount) throw new Error("No creator Stripe account is available for qualification");

  const account = await stripe.accounts.update(paymentAccount.stripe_account_id, {
    metadata: { creativesos_webhook_qualification: qualificationId },
  });

  let ledgerEvent = null;
  for (let attempt = 0; attempt < 20 && !ledgerEvent; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2_000));
    [ledgerEvent] = await sql`
      select provider_event_id, event_type, status, connected_account_id, processed_at
      from commerce_provider_events
      where provider = 'stripe'
        and event_type = 'account.updated'
        and provider_object_reference = ${account.id}
        and received_at >= ${startedAt}
      limit 1
    `;
  }
  if (!ledgerEvent) throw new Error("The connected-account update was not delivered to the CreativesOS webhook ledger");
  if (ledgerEvent.status !== "processed") throw new Error(`Stripe event ${ledgerEvent.provider_event_id} finished with status ${ledgerEvent.status}`);

  console.log(JSON.stringify({
    status: "qualified",
    accountId: account.id,
    localAccountStatus: paymentAccount.status,
    eventId: ledgerEvent.provider_event_id,
    ledger: ledgerEvent,
  }));
} finally {
  await sql.end({ timeout: 5 });
}
