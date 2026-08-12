import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const appUrl = (process.env.APP_URL || "https://creativesos.net").replace(/\/$/, "");
const webhookUrl = `${appUrl}/api/stripe/webhook`;
const requiredEvents = [
  "account.updated",
  "charge.dispute.closed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.refunded",
  "checkout.session.async_payment_succeeded",
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.paid",
  "payout.canceled",
  "payout.created",
  "payout.failed",
  "payout.paid",
  "payout.updated",
];
const apply = process.argv.includes("--apply");
const createConnect = process.argv.includes("--create-connect");

const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const matches = endpoints.data.filter((endpoint) => endpoint.url === webhookUrl && endpoint.status === "enabled");
const connectDescription = "CreativesOS connected-account financial lifecycle";
// Some Stripe API versions omit the `connect` field when listing an endpoint
// even though it was returned at creation time. The platform-owned description
// gives us a stable discriminator without relying on list-response shape.
const isConnectEndpoint = (endpoint) => endpoint.connect === true || endpoint.description === connectDescription;
const platformMatches = matches.filter((endpoint) => !isConnectEndpoint(endpoint));
const connectMatches = matches.filter(isConnectEndpoint);
if (platformMatches.length !== 1) {
  throw new Error(`Expected exactly one enabled platform Stripe webhook endpoint for ${webhookUrl}; found ${platformMatches.length}`);
}
if (connectMatches.length > 1) throw new Error(`Expected at most one enabled Connect webhook endpoint for ${webhookUrl}; found ${connectMatches.length}`);

const endpoint = platformMatches[0];
const current = endpoint.enabled_events;
const missing = current.includes("*") ? [] : requiredEvents.filter((event) => !current.includes(event));

if (createConnect) {
  if (connectMatches.length === 1) {
    console.log(JSON.stringify({
      status: "already_exists",
      endpoint_id: connectMatches[0].id,
      url: connectMatches[0].url,
      connect_events_enabled: true,
      signing_secret: null,
    }));
  } else {
    const connected = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: requiredEvents,
      connect: true,
      description: connectDescription,
    });
    console.log(JSON.stringify({
      status: "created",
      endpoint_id: connected.id,
      url: connected.url,
      connect_events_enabled: Boolean(connected.connect),
      signing_secret: connected.secret,
    }));
  }
} else if (!apply || missing.length === 0) {
  console.log(JSON.stringify({
    status: missing.length === 0 && connectMatches.length === 1 ? "ready" : "changes_required",
    endpoint_id: endpoint.id,
    url: endpoint.url,
    enabled_events: current,
    connect_events_enabled: connectMatches.length === 1,
    missing_events: missing,
    missing_connect_endpoint: connectMatches.length === 0,
  }));
} else {
  const enabledEvents = Array.from(new Set([...current, ...requiredEvents])).sort();
  const updated = await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: enabledEvents });
  console.log(JSON.stringify({
    status: "updated",
    endpoint_id: updated.id,
    url: updated.url,
    enabled_events: updated.enabled_events,
    connect_events_enabled: connectMatches.length === 1,
    missing_events: [],
    missing_connect_endpoint: connectMatches.length === 0,
  }));
}
