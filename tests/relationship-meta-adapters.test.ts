import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messengerRelationshipAdapter, verifyMetaWebhookChallenge, whatsappRelationshipAdapter } from "../server/relationship-meta-adapters";

const originalEnvironment = { ...process.env };
const baseContext = { businessId: "business", connectionId: "connection", providerAccountId: "account-1", accessToken: "token", webhookSecret: "secret", metadata: {} };

afterEach(() => { process.env = { ...originalEnvironment }; vi.restoreAllMocks(); });

describe("Messenger Relationship Hub adapter", () => {
  it("normalizes page messages and ignores echoes", async () => {
    const events = await messengerRelationshipAdapter.normalizeWebhook({
      context: baseContext, headers: {},
      body: { object: "page", entry: [{ id: "account-1", time: 1_786_000_000, messaging: [{ sender: { id: "person-1" }, timestamp: 1_786_000_001_000, message: { mid: "mid-1", text: "pricing" } }, { sender: { id: "account-1" }, message: { mid: "mid-2", text: "echo", is_echo: true } }] }] },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ provider: "messenger", externalEventId: "message:mid-1", actor: { providerSubjectId: "person-1" }, message: { body: "pricing" } });
  });

  it("delivers text to the page messaging endpoint", async () => {
    process.env.META_GRAPH_API_VERSION = "v25.0"; process.env.META_GRAPH_BASE_URL = "https://meta.test";
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ recipient_id: "person-1", message_id: "out-1" }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(messengerRelationshipAdapter.deliver({ context: baseContext, action: { version: "relationship.action.v1", actionType: "message.send", idempotencyKey: "message-key", externalThreadId: "person-1", body: "Hello", bodyFormat: "plain", attachments: [], metadata: {} } })).resolves.toMatchObject({ externalMessageId: "out-1" });
    expect(request).toHaveBeenCalledWith("https://meta.test/v25.0/account-1/messages", expect.objectContaining({ method: "POST" }));
  });
});

describe("WhatsApp Relationship Hub adapter", () => {
  it("normalizes inbound messages and delivery receipts", async () => {
    const events = await whatsappRelationshipAdapter.normalizeWebhook({
      context: baseContext, headers: {},
      body: { object: "whatsapp_business_account", entry: [{ id: "waba-1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "account-1" }, contacts: [{ wa_id: "15551234567", profile: { name: "Customer" } }], messages: [{ id: "wamid.1", from: "15551234567", timestamp: "1786000000", type: "text", text: { body: "GUIDE" } }], statuses: [{ id: "wamid.out", recipient_id: "15551234567", timestamp: "1786000001", status: "delivered" }] } }] }] },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ provider: "whatsapp", eventType: "message.received", actor: { displayName: "Customer" }, message: { body: "GUIDE" } });
    expect(events[1]).toMatchObject({ eventType: "message.delivered", receipt: { externalMessageId: "wamid.out", type: "delivered" } });
  });

  it("delivers an audio URL as a WhatsApp media message", async () => {
    process.env.META_GRAPH_API_VERSION = "v25.0"; process.env.META_GRAPH_BASE_URL = "https://meta.test";
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    await whatsappRelationshipAdapter.deliver({ context: baseContext, action: { version: "relationship.action.v1", actionType: "message.send", idempotencyKey: "message-key", externalThreadId: "15551234567", body: "", bodyFormat: "plain", attachments: [{ type: "voice_note", sourceUrl: "https://creativesos.net/audio/1", metadata: {} }], metadata: {} } });
    const init = request.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ messaging_product: "whatsapp", to: "15551234567", type: "audio", audio: { link: "https://creativesos.net/audio/1" } });
  });
});

describe("Meta webhook security", () => {
  it("verifies raw signatures and constant-time challenge tokens", async () => {
    const rawBody = Buffer.from('{"object":"page"}');
    const signature = `sha256=${crypto.createHmac("sha256", "secret").update(rawBody).digest("hex")}`;
    expect(await messengerRelationshipAdapter.verifyWebhook!({ rawBody, headers: { "x-hub-signature-256": signature }, context: baseContext })).toBe(true);
    expect(verifyMetaWebhookChallenge({ mode: "subscribe", token: "verify", challenge: "123" }, "verify")).toBe("123");
    expect(verifyMetaWebhookChallenge({ mode: "subscribe", token: "wrong", challenge: "123" }, "verify")).toBeNull();
  });
});
