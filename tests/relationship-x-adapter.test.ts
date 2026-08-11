import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createXWebhookCrcResponse, xRelationshipAdapter } from "../server/relationship-x-adapter";
import { xRelationshipConfiguration } from "../server/relationship-x-oauth";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.restoreAllMocks();
});

const context = { businessId: "business", connectionId: "connection", providerAccountId: "owner-1", accessToken: "token", webhookSecret: "secret", metadata: {} };

describe("X Relationship Hub adapter", () => {
  it("normalizes inbound DMs and ignores outbound echoes", async () => {
    const events = await xRelationshipAdapter.normalizeWebhook({
      context,
      headers: {},
      body: {
        for_user_id: "owner-1",
        direct_message_events: [
          { id: "dm-1", event_type: "MessageCreate", text: "Need pricing", sender_id: "person-1", dm_conversation_id: "thread-1", created_at: "2026-08-10T12:00:00Z", participant_ids: ["owner-1", "person-1"] },
          { id: "dm-2", event_type: "MessageCreate", text: "Our reply", sender_id: "owner-1", dm_conversation_id: "thread-1" },
        ],
        includes: { users: [{ id: "person-1", name: "Prospect", username: "prospect" }] },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "x", externalEventId: "dm:dm-1", actor: { providerSubjectId: "person-1", username: "prospect" }, thread: { externalThreadId: "thread-1" }, message: { body: "Need pricing" } });
  });

  it("verifies webhook signatures and creates CRC responses", async () => {
    const rawBody = Buffer.from('{"direct_message_events":[]}');
    const signature = `sha256=${crypto.createHmac("sha256", "secret").update(rawBody).digest("base64")}`;
    expect(await xRelationshipAdapter.verifyWebhook!({ rawBody, headers: { "x-twitter-webhooks-signature": signature }, context })).toBe(true);
    expect(createXWebhookCrcResponse("challenge", "secret")).toBe(`sha256=${crypto.createHmac("sha256", "secret").update("challenge").digest("base64")}`);
  });

  it("delivers a DM through the provider conversation endpoint", async () => {
    process.env.X_API_BASE_URL = "https://x.test";
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { dm_event_id: "dm-out", dm_conversation_id: "thread-1" } }), { status: 201, headers: { "content-type": "application/json" } }));
    await expect(xRelationshipAdapter.deliver({ context, action: { version: "relationship.action.v1", actionType: "message.send", idempotencyKey: "message-key", externalThreadId: "thread-1", body: "Hello", bodyFormat: "plain", attachments: [], metadata: {} } })).resolves.toMatchObject({ externalMessageId: "dm-out", status: "sent" });
    expect(request).toHaveBeenCalledWith("https://x.test/2/dm_conversations/thread-1/messages", expect.objectContaining({ method: "POST" }));
  });
});

describe("X Relationship Hub configuration", () => {
  it("requires the provider credentials and secure token storage", () => {
    Object.assign(process.env, { X_CLIENT_ID: "client", X_CLIENT_SECRET: "client-secret", X_API_SECRET: "api-secret", SOCIAL_TOKEN_ENCRYPTION_KEY: "1".repeat(64), PUBLIC_APP_URL: "https://creativesos.net" });
    expect(xRelationshipConfiguration()).toMatchObject({ configured: true, pollingFallback: true });
  });
});
