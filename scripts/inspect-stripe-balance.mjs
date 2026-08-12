import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const connectedAccount = process.argv.find((argument) => argument.startsWith("--account="))?.split("=")[1];
const balance = connectedAccount
  ? await stripe.balance.retrieve({}, { stripeAccount: connectedAccount })
  : await stripe.balance.retrieve();
console.log(JSON.stringify({
  account: connectedAccount ?? "platform",
  livemode: balance.livemode,
  available: balance.available.map(({ amount, currency, source_types: sourceTypes }) => ({ amount, currency, sourceTypes })),
  pending: balance.pending.map(({ amount, currency, source_types: sourceTypes }) => ({ amount, currency, sourceTypes })),
  connectReserved: balance.connect_reserved?.map(({ amount, currency }) => ({ amount, currency })) ?? [],
}));
