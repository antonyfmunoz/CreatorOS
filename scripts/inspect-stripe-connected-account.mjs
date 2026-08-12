import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required");
const accountId = process.argv.find((argument) => argument.startsWith("--account="))?.split("=")[1];
if (!accountId) throw new Error("--account is required");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const account = await stripe.accounts.retrieve(accountId);
const externalAccounts = await stripe.accounts.listExternalAccounts(accountId, { limit: 10 });
console.log(JSON.stringify({
  id: account.id,
  type: account.type,
  country: account.country,
  defaultCurrency: account.default_currency,
  chargesEnabled: account.charges_enabled,
  payoutsEnabled: account.payouts_enabled,
  detailsSubmitted: account.details_submitted,
  requirements: {
    disabledReason: account.requirements?.disabled_reason ?? null,
    currentlyDue: account.requirements?.currently_due ?? [],
    pastDue: account.requirements?.past_due ?? [],
  },
  externalAccounts: externalAccounts.data.map((external) => ({
    id: external.id,
    object: external.object,
    bankName: external.object === "bank_account" ? external.bank_name : null,
    brand: external.object === "card" ? external.brand : null,
    currency: external.currency,
    country: external.country,
    defaultForCurrency: external.default_for_currency,
    status: external.object === "bank_account" ? external.status : null,
    last4: external.last4,
  })),
}));
