import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

let orderId = process.argv.find((argument) => argument.startsWith("--order="))?.split("=")[1];

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  if (!orderId) {
    const [recentOrder] = await sql`
      select id from orders
      where payment_provider = 'stripe' and status = 'paid'
      order by updated_at desc
      limit 1
    `;
    orderId = recentOrder?.id;
  }
  if (!orderId) throw new Error("No paid Stripe order is available for qualification");
  const [order] = await sql`
    select
      o.id,
      o.status,
      o.financial_status,
      o.refunded_amount,
      o.disputed_amount,
      o.provider_payment_reference,
      o.subscription_status,
      o.subscription_cancel_at_period_end,
      count(distinct e.id) filter (where e.status = 'active')::int as active_entitlements,
      count(distinct e.id) filter (where e.status = 'revoked')::int as revoked_entitlements,
      count(distinct cm.id) filter (where cm.status = 'active' and cm.role = 'member')::int as active_paid_memberships
    from orders o
    left join entitlements e on e.source_order_id = o.id
    left join order_items oi on oi.order_id = o.id
    left join products p on p.id = oi.product_id
    left join community_memberships cm
      on cm.community_id = p.community_id
      and cm.user_id = o.buyer_id
    where o.id = ${orderId}
    group by o.id
  `;
  if (!order) throw new Error(`Order ${orderId} was not found`);

  const [creatorAllocations] = await sql`
    select
      count(*) filter (where status = 'paid')::int as paid_allocations,
      coalesce(sum(gross_amount) filter (where status = 'paid'), 0)::float8 as paid_gross_amount,
      coalesce(sum(platform_fee_amount) filter (where status = 'paid'), 0)::float8 as paid_platform_fee_amount,
      coalesce(sum(creator_net_amount) filter (where status = 'paid'), 0)::float8 as paid_creator_net_amount
    from creator_earnings_allocations
  `;

  const orderAllocations = await sql`
    select status, gross_amount, platform_fee_amount, creator_net_amount,
      refunded_amount, disputed_amount, reversed_amount
    from creator_earnings_allocations
    where order_id = ${orderId}
    order by created_at
  `;

  const providerEvents = await sql`
    select provider_event_id, event_type, status, amount, currency, connected_account_id, processed_at
    from commerce_provider_events
    where order_id = ${orderId}
    order by received_at desc
  `;

  const recentFinancialEvents = await sql`
    select provider_event_id, event_type, status, order_id, amount, currency, connected_account_id, processed_at
    from commerce_provider_events
    where event_type in ('charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed')
    order by received_at desc
    limit 10
  `;

  console.log(JSON.stringify({ order, creatorAllocations, orderAllocations, providerEvents, recentFinancialEvents }));
} finally {
  await sql.end({ timeout: 5 });
}
