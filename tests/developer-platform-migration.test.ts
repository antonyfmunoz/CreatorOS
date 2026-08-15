import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/0097_developer_platform.sql", import.meta.url),
  "utf8",
);

describe("developer platform migration", () => {
  it("stores only key hashes and keeps webhook delivery evidence retry-safe", () => {
    expect(migration).toContain('CREATE TABLE "developer_api_keys"');
    expect(migration).toContain('"key_hash" text NOT NULL UNIQUE');
    expect(migration).not.toContain('"raw_key"');
    expect(migration).toContain('"secret_ciphertext" text NOT NULL');
    expect(migration).toContain('CREATE TABLE "developer_webhook_deliveries"');
    expect(migration).toContain(
      "developer_webhook_deliveries_event_endpoint_unique",
    );
    expect(migration).toContain("dead_letter");
  });
  it("adds revocable OAuth apps, installations, one-time codes and access tokens", () => {
    const oauth = readFileSync(new URL("../migrations/0099_developer_oauth.sql", import.meta.url), "utf8");
    for (const table of ["developer_oauth_apps", "developer_oauth_installations", "developer_oauth_authorization_codes", "developer_oauth_access_tokens", "developer_oauth_refresh_tokens", "developer_oauth_rate_windows"])
      expect(oauth).toContain(`CREATE TABLE "${table}"`);
    expect(oauth).toContain("developer_oauth_installations_app_business_unique");
    expect(oauth).not.toContain('"client_secret" text');
  });
  it("adds reviewed public listings and isolated expiring sandboxes", () => {
    const marketplace = readFileSync(new URL("../migrations/0100_developer_marketplace_sandbox.sql", import.meta.url), "utf8");
    expect(marketplace).toContain('CREATE TABLE "developer_sandboxes"');
    expect(marketplace).toContain('ADD COLUMN "review_status"');
    expect(marketplace).toContain("developer_oauth_apps_review_status_check");
  });
});
