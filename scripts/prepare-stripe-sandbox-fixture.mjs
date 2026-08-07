import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const marker = `stripe-sandbox-${Date.now()}`;

try {
  const fixture = await sql.begin(async (tx) => {
    // A failed field-test attempt can leave only its synthetic seller. Remove
    // that precise, product-less orphan before trying again.
    await tx.unsafe(`
      delete from users
      where username like 'stripe-sandbox-%-seller'
        and not exists (select 1 from products where products.user_id = users.id)
    `);

    const buyers = await tx.unsafe("select id from users order by id limit 2");
    if (!buyers.length) {
      throw new Error("No authenticated CreativesOS buyer has been provisioned yet");
    }

    const [seller] = await tx`
      insert into users (clerk_id, username, display_name, role)
      values (${`${marker}-seller`}, ${`${marker}-seller`}, ${"Stripe Sandbox Seller"}, ${"creator"})
      returning id
    `;

    const [product] = await tx`
      insert into products (user_id, title, description, price, category, status)
      values (
        ${seller.id},
        ${"Sandbox checkout verification offer"},
        ${"Temporary $1 sandbox fixture for the CreativesOS Stripe fulfillment field test."},
        ${1.0},
        ${"Digital Asset"},
        ${"published"}
      )
      returning id
    `;

    return { buyerId: buyers[0].id, sellerId: seller.id, productId: product.id };
  });

  console.log(JSON.stringify({
    marker,
    ...fixture,
  }));
} finally {
  await sql.end({ timeout: 5 });
}
