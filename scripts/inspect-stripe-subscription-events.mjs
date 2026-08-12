import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");

const subscriptionId = process.argv.find((argument) => argument.startsWith("--subscription="))?.split("=")[1];
if (!subscriptionId) throw new Error("Pass --subscription=sub_...");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const account = await stripe.accounts.retrieve();
const eventTypes = ["customer.subscription.updated", "customer.subscription.deleted", "invoice.paid"];
const matches = [];

for (const type of eventTypes) {
  const events = await stripe.events.list({ type, limit: 100 });
  for (const event of events.data) {
    const object = event.data.object;
    const eventSubscription = event.type === "invoice.paid"
      ? object.parent?.subscription_details?.subscription
      : object.id;
    const eventSubscriptionId = typeof eventSubscription === "string" ? eventSubscription : eventSubscription?.id;
    if (eventSubscriptionId === subscriptionId) {
      matches.push({
        id: event.id,
        type: event.type,
        objectId: object.id,
        created: event.created,
        deliveryPending: event.pending_webhooks > 0,
      });
    }
  }
}

matches.sort((left, right) => right.created - left.created);
console.log(JSON.stringify({
  account: {
    id: account.id,
    email: account.email ?? null,
    businessName: account.business_profile?.name ?? null,
  },
  subscriptionId,
  events: matches,
}));
