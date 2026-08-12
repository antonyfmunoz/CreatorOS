import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/0062_commerce_financial_lifecycle.sql", import.meta.url), "utf8");

describe("commerce financial lifecycle migration", () => {
  it("creates replay-safe provider evidence and connected payout state", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "commerce_provider_events"');
    expect(migration).toContain('CONSTRAINT "commerce_provider_event_unique" UNIQUE ("provider", "provider_event_id")');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "creator_payout_events"');
    expect(migration).toContain('"provider_payout_id" text NOT NULL UNIQUE');
  });

  it("adds refund, dispute, payment-reference and account-remediation state", () => {
    for (const column of [
      "provider_payment_reference",
      "financial_status",
      "refunded_amount",
      "disputed_amount",
      "last_provider_event_at",
      "requirements_currently_due",
      "requirements_past_due",
      "disabled_reason",
      "reversed_amount",
    ]) expect(migration).toContain(`"${column}"`);
  });
});
