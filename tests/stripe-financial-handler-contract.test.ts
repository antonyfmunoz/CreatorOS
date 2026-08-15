import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../server/stripe.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../scripts/migrate-production.mjs", import.meta.url), "utf8");

describe("Stripe financial handler contract", () => {
  it("accepts separate platform and connected-account signing secrets", () => {
    expect(source).toContain('configuredValue("STRIPE_WEBHOOK_SECRET")');
    expect(source).toContain('configuredValue("STRIPE_CONNECT_WEBHOOK_SECRET")');
  });

  it("reverses destination transfers during disputes and restores won funds", () => {
    expect(source).toContain("transfers.createReversal");
    expect(source).toContain("candidate.source_transaction");
    expect(source).toContain('purpose: "dispute_risk_recovery"');
    expect(source).toContain('purpose: "dispute_won_restoration"');
    expect(source).toContain("creativesos-dispute-${input.dispute.id}-restore");
    expect(source).toContain("alreadyRestored");
    expect(source).toContain('status: "restoration_pending"');
    expect(source).toContain("scheduleStripeCommerceRecovery");
    expect(source).toContain("staleClaimCutoff");
  });

  it("supports idempotent historical Checkout Session refunds", () => {
    expect(source).toMatch(
      /checkout\.sessions\.list\(\{\s*payment_intent:\s*paymentReference,\s*limit:\s*2,?\s*\}\)/,
    );
    expect(source).toContain('req.header("idempotency-key")');
  });

  it("uses a transaction-scoped production migration lock", () => {
    expect(migrationSource).toContain("pg_advisory_xact_lock(84231859)");
    expect(migrationSource).not.toContain("pg_advisory_lock(84231859)");
    expect(migrationSource).not.toContain("pg_advisory_unlock(84231859)");
  });
});
