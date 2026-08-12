import Stripe from "stripe";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const title = "[MVP TEST] Platform recurring membership";

try {
  const [order] = await sql`
    select
      o.id as order_id,
      o.provider_subscription_reference as subscription_id
    from orders o
    join order_items oi on oi.order_id = o.id
    join products p on p.id = oi.product_id
    where p.title = ${title}
      and o.status = 'paid'
      and o.provider_subscription_reference is not null
    order by o.created_at desc
    limit 1
  `;
  if (!order) throw new Error("No paid recurring sandbox order was found");

  const subscription = await stripe.subscriptions.cancel(order.subscription_id);
  console.log(JSON.stringify({
    status: "terminated",
    order_id: order.order_id,
    subscription_id: subscription.id,
    subscription_status: subscription.status,
  }));
} finally {
  await sql.end({ timeout: 5 });
}
