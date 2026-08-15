import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createDeveloperApiKeySchema,
  createDeveloperOAuthAppSchema,
  developerAppListingSchema,
  developerCursor,
  isSafeWebhookUrl,
  parseDeveloperCursor,
} from "../shared/developer-platform";
import { developerWebhookSignature } from "../server/developer-platform";

const runtimeSource = readFileSync(
  new URL("../server/developer-platform.ts", import.meta.url),
  "utf8",
);

describe("developer platform contract", () => {
  it("requires explicit bounded scopes", () => {
    expect(
      createDeveloperApiKeySchema.safeParse({
        name: "Analytics production",
        scopes: ["profile:read", "analytics:read"],
      }).success,
    ).toBe(true);
    expect(
      createDeveloperApiKeySchema.safeParse({
        name: "Unsafe",
        scopes: ["admin:*"],
      }).success,
    ).toBe(false);
  });

  it("requires OAuth apps to declare redirects and bounded scopes", () => {
    expect(createDeveloperOAuthAppSchema.safeParse({ name: "Reporting app", redirectUris: ["https://app.example.com/callback"], scopes: ["profile:read"] }).success).toBe(true);
    expect(createDeveloperOAuthAppSchema.safeParse({ name: "Reporting app", redirectUris: [], scopes: ["admin:*"] }).success).toBe(false);
  });
  it("requires reviewable public app policy links", () => {
    expect(developerAppListingSchema.safeParse({ description: "A sufficiently detailed application description.", homepageUrl: "https://app.example.com", privacyUrl: "https://app.example.com/privacy", termsUrl: "https://app.example.com/terms" }).success).toBe(true);
    expect(developerAppListingSchema.safeParse({ description: "short", homepageUrl: "nope", privacyUrl: "nope", termsUrl: "nope" }).success).toBe(false);
  });

  it("rejects private-network and credential-bearing webhook URLs", () => {
    expect(isSafeWebhookUrl("https://hooks.example.com/creativesos")).toBe(
      true,
    );
    expect(isSafeWebhookUrl("http://localhost:3000/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://192.168.1.4/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://user:pass@example.com/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://127.0.0.1:3417/hook", true)).toBe(true);
  });

  it("round-trips opaque cursors and signs timestamp-bound payloads", () => {
    const cursor = developerCursor({
      createdAt: new Date("2026-08-14T12:00:00.000Z"),
      id: crypto.randomUUID(),
    });
    expect(parseDeveloperCursor(cursor)?.createdAt.toISOString()).toBe(
      "2026-08-14T12:00:00.000Z",
    );
    expect(developerWebhookSignature("secret", "100", "{}")).toMatch(
      /^v1=[a-f0-9]{64}$/,
    );
    expect(developerWebhookSignature("secret", "100", "{}")).not.toBe(
      developerWebhookSignature("secret", "101", "{}"),
    );
  });

  it("atomically rotates OAuth credentials and fully revokes sandboxes", () => {
    expect(runtimeSource).toContain("throw new InvalidOAuthGrantError()");
    expect(runtimeSource).toContain(
      "tx.insert(developerOAuthAccessTokens).values(issued.accessValues)",
    );
    expect(runtimeSource).toContain(
      "tx.insert(developerOAuthRefreshTokens).values(issued.refreshValues)",
    );
    expect(runtimeSource).toContain(
      "inArray(developerOAuthAccessTokens.installationId, installationIds)",
    );
    expect(runtimeSource).toContain(
      "inArray(developerOAuthRefreshTokens.installationId, installationIds)",
    );
  });
});
