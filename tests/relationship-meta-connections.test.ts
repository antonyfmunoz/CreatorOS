import { afterEach, describe, expect, it, vi } from "vitest";
import {
  messengerRelationshipConfiguration,
  metaPaged,
  metaWebhookChallenge,
  whatsappRelationshipConfiguration,
} from "../server/relationship-meta-connections";
import { instagramRelationshipConfiguration } from "../server/relationship-instagram-oauth";

const originalEnvironment = { ...process.env };

function configuredEnvironment() {
  process.env.META_APP_ID = "meta-app";
  process.env.META_APP_SECRET = "meta-secret";
  process.env.META_GRAPH_API_VERSION = "v25.0";
  process.env.RELATIONSHIP_META_WEBHOOK_VERIFY_TOKEN = "webhook-secret";
  process.env.RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "instagram-webhook-secret";
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.PUBLIC_APP_URL = "https://creativesos.net";
}

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

describe("Meta relationship provider configuration", () => {
  it("paginates with provider cursors without following an untrusted next URL", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "page-1" }], paging: { cursors: { after: "cursor-2" }, next: "https://attacker.invalid/steal" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "page-2" }] }), { status: 200 }));
    await expect(metaPaged<{ id: string }>(new URL("https://graph.facebook.com/v25.0/me/accounts?limit=100"))).resolves.toEqual([{ id: "page-1" }, { id: "page-2" }]);
    expect(String(request.mock.calls[1][0])).toContain("graph.facebook.com/v25.0/me/accounts");
    expect(String(request.mock.calls[1][0])).toContain("after=cursor-2");
  });

  it("activates only with valid server-side security configuration", () => {
    configuredEnvironment();
    expect(messengerRelationshipConfiguration().configured).toBe(true);
    expect(whatsappRelationshipConfiguration()).toMatchObject({
      configured: true,
      connectionMode: "system_user_token",
      embeddedSignupConfigured: false,
    });
    expect(instagramRelationshipConfiguration().configured).toBe(true);

    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "not-a-32-byte-key";
    expect(messengerRelationshipConfiguration().configured).toBe(false);
    expect(instagramRelationshipConfiguration().configured).toBe(false);
  });

  it("advertises Embedded Signup only when its Meta configuration exists", () => {
    configuredEnvironment();
    process.env.META_WHATSAPP_CONFIG_ID = "whatsapp-business-login-config";
    expect(whatsappRelationshipConfiguration()).toMatchObject({
      configured: true,
      connectionMode: "embedded_signup",
      embeddedSignupConfigured: true,
    });
  });

  it("uses fail-closed webhook challenge verification", () => {
    configuredEnvironment();
    expect(metaWebhookChallenge({ mode: "subscribe", token: "webhook-secret", challenge: "challenge-value" })).toBe("challenge-value");
    expect(metaWebhookChallenge({ mode: "subscribe", token: "wrong", challenge: "challenge-value" })).toBeNull();
  });

  it("fails closed for malformed graph versions and public URLs", () => {
    configuredEnvironment();
    process.env.META_GRAPH_API_VERSION = "latest";
    expect(whatsappRelationshipConfiguration().configured).toBe(false);
    process.env.META_GRAPH_API_VERSION = "v25.0";
    process.env.PUBLIC_APP_URL = "http://creativesos.net";
    expect(messengerRelationshipConfiguration().configured).toBe(false);
  });
});
