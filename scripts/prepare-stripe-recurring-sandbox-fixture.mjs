import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const title = "[MVP TEST] Platform recurring membership";

try {
  const fixture = await sql.begin(async (tx) => {
    const [existing] = await tx`
      select p.id as product_id, p.user_id as seller_id, p.community_id
      from products p
      where p.title = ${title}
      limit 1
    `;
    if (existing) return existing;

    const [seller] = await tx`
      select p.user_id as seller_id
      from products p
      where p.title = ${"Sandbox checkout verification offer"}
      limit 1
    `;
    if (!seller) {
      throw new Error("The existing Stripe Sandbox Seller fixture was not found");
    }

    const [community] = await tx`
      insert into communities (name, description, icon_color)
      values (
        ${title},
        ${"Temporary production qualification community for the recurring Stripe lifecycle."},
        ${"#1d9bf0"}
      )
      returning id
    `;
    const [product] = await tx`
      insert into products (
        user_id,
        community_id,
        payout_mode,
        status,
        product_type,
        billing_model,
        billing_interval,
        title,
        description,
        price,
        category
      ) values (
        ${seller.seller_id},
        ${community.id},
        ${"platform"},
        ${"published"},
        ${"membership"},
        ${"recurring"},
        ${"month"},
        ${title},
        ${"Temporary $1 sandbox membership for checkout, webhook, entitlement, cancellation, and revocation proof."},
        ${1},
        ${"Membership"}
      )
      returning id
    `;
    await tx`
      insert into community_memberships (user_id, community_id, role)
      values (${seller.seller_id}, ${community.id}, ${"owner"})
      on conflict (user_id, community_id) do nothing
    `;
    await tx`
      insert into channels (community_id, name)
      values (${community.id}, ${"general"})
    `;
    return {
      product_id: product.id,
      seller_id: seller.seller_id,
      community_id: community.id,
    };
  });

  console.log(JSON.stringify({ status: "ready", ...fixture }));
} finally {
  await sql.end({ timeout: 5 });
}
