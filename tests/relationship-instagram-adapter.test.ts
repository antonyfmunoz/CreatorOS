import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { instagramRelationshipAdapter } from "../server/relationship-instagram-adapter";
import { instagramRelationshipConfiguration, verifyInstagramWebhookChallenge } from "../server/relationship-instagram-oauth";

const context = {
  businessId: "00000000-0000-4000-8000-000000000001",
  connectionId: "00000000-0000-4000-8000-000000000002",
  providerAccountId: "ig-business-1",
  metadata: {},
};

afterEach(() => {
  delete process.env.INSTAGRAM_APP_SECRET;
  delete process.env.INSTAGRAM_APP_ID;
  delete process.env.META_GRAPH_API_VERSION;
  delete process.env.RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  delete process.env.PUBLIC_APP_URL;
});

describe("Instagram Relationship Hub configuration", () => {
  it("uses the relationship-scoped webhook token for activation and challenge verification", () => {
    Object.assign(process.env, {
      INSTAGRAM_APP_ID: "app",
      INSTAGRAM_APP_SECRET: "secret",
      META_GRAPH_API_VERSION: "v24.0",
      RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "relationship-webhook-token",
      SOCIAL_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      PUBLIC_APP_URL: "https://creativesos.net",
    });
    expect(instagramRelationshipConfiguration().configured).toBe(true);
    expect(verifyInstagramWebhookChallenge({ mode: "subscribe", token: "relationship-webhook-token", challenge: "challenge-value" })).toBe("challenge-value");
    expect(verifyInstagramWebhookChallenge({ mode: "subscribe", token: "wrong", challenge: "challenge-value" })).toBeNull();
  });
});

describe("Instagram Relationship Hub adapter", () => {
  it("normalizes inbound DMs while discarding message echoes", async () => {
    const base = { sender: { id: "person-1" }, recipient: { id: "ig-business-1" }, timestamp: 1_780_000_000_000 };
    const events = await instagramRelationshipAdapter.normalizeWebhook({
      context,
      headers: {},
      body: { object: "instagram", entry: [{ id: "ig-business-1", messaging: [{ ...base, message: { mid: "mid-1", text: "pricing" } }, { ...base, message: { mid: "mid-2", text: "echo", is_echo: true } }] }] },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "instagram", eventType: "social.dm.received", externalEventId: "message:mid-1", actor: { providerSubjectId: "person-1" }, message: { body: "pricing" } });
  });

  it("normalizes professional-account comments for private-reply automation", async () => {
    const events = await instagramRelationshipAdapter.normalizeWebhook({
      context,
      headers: {},
      body: { object: "instagram", entry: [{ id: "ig-business-1", time: 1_780_000_000, changes: [{ field: "comments", value: { id: "comment-1", text: "GUIDE", from: { id: "person-2", username: "reader" }, media: { id: "media-1" } } }] }] },
    });
    expect(events[0]).toMatchObject({ eventType: "social.comment.created", thread: { externalThreadId: "comment-1", kind: "comment" }, message: { externalMessageId: "comment-1", body: "GUIDE" } });
  });

  it("verifies the exact raw Meta signature", async () => {
    process.env.INSTAGRAM_APP_SECRET = "test-secret";
    const rawBody = Buffer.from('{"object":"instagram"}');
    const signature = `sha256=${crypto.createHmac("sha256", "test-secret").update(rawBody).digest("hex")}`;
    expect(await instagramRelationshipAdapter.verifyWebhook!({ rawBody, headers: { "x-hub-signature-256": signature }, context })).toBe(true);
    expect(await instagramRelationshipAdapter.verifyWebhook!({ rawBody, headers: { "x-hub-signature-256": "sha256=bad" }, context })).toBe(false);
  });
});
