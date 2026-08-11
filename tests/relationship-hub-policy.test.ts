import { beforeEach, describe, expect, it } from "vitest";
import {
  assertRelationshipCapability,
  assertVoiceGenerationAllowed,
  normalizedRelationshipEventSchema,
  relationshipDeliveryBackoffMs,
  sanitizeRelationshipProviderError,
} from "../server/relationship-hub-policy";
import {
  clearRelationshipAdaptersForTests,
  createInMemoryRelationshipAdapter,
  deliverRelationshipAction,
  normalizeRelationshipWebhook,
  registerRelationshipAdapter,
  requireRelationshipAdapter,
} from "../server/relationship-channel-adapters";

const inboundEvent = {
  version: "relationship.event.v1" as const,
  provider: "test",
  externalEventId: "event-1",
  eventType: "message.received" as const,
  occurredAt: "2026-08-10T12:00:00.000Z",
  actor: {
    providerSubjectId: "contact-1",
    displayName: "Customer",
  },
  thread: {
    externalThreadId: "thread-1",
    kind: "direct" as const,
  },
  message: {
    externalMessageId: "message-in-1",
    type: "text" as const,
    body: "Hello",
  },
};

describe("relationship hub provider contracts", () => {
  beforeEach(() => clearRelationshipAdaptersForTests());

  it("normalizes bounded provider events without persisting raw secrets", async () => {
    const adapter = createInMemoryRelationshipAdapter({ provider: "test" });
    const [event] = await normalizeRelationshipWebhook(adapter, {
      body: inboundEvent,
      headers: {},
      context: {
        businessId: "business-1",
        connectionId: "connection-1",
        providerAccountId: "account-1",
        metadata: {},
      },
    });
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.actor.providerSubjectId).toBe("contact-1");
    expect((event as Record<string, unknown>).rawBody).toBeUndefined();
  });

  it("rejects incomplete message events", () => {
    expect(() => normalizedRelationshipEventSchema.parse({
      ...inboundEvent,
      message: undefined,
    })).toThrow(/message or receipt/i);
  });

  it("enforces connection capabilities before provider delivery", async () => {
    const adapter = createInMemoryRelationshipAdapter({
      provider: "limited",
      capabilities: { "message.send": true, "media.audio": false },
    });
    await expect(deliverRelationshipAction(adapter, {
      context: {
        businessId: "business-1",
        connectionId: "connection-1",
        providerAccountId: "account-1",
        metadata: {},
      },
      action: {
        version: "relationship.action.v1",
        actionType: "message.send",
        idempotencyKey: "outbound-123",
        externalThreadId: "thread-1",
        body: "Audio follows",
        attachments: [{ type: "audio", sourceUrl: "https://example.com/audio.mp3" }],
        metadata: {},
      },
    })).rejects.toThrow(/media\.audio/i);
    expect(adapter.deliveries).toHaveLength(0);
  });

  it("registers provider adapters and delivers idempotency-aware actions", async () => {
    const adapter = createInMemoryRelationshipAdapter({ provider: "instagram" });
    registerRelationshipAdapter(adapter);
    expect(requireRelationshipAdapter("INSTAGRAM")).toBe(adapter);
    const delivered = await deliverRelationshipAction(adapter, {
      context: {
        businessId: "business-1",
        connectionId: "connection-1",
        providerAccountId: "account-1",
        metadata: {},
      },
      action: {
        version: "relationship.action.v1",
        actionType: "message.send",
        idempotencyKey: "delivery-123",
        externalThreadId: "thread-1",
        body: "Thanks for reaching out",
        attachments: [],
        metadata: {},
      },
    });
    expect(delivered.externalMessageId).toBe("message-1");
    expect(adapter.deliveries[0].idempotencyKey).toBe("delivery-123");
    expect(() => registerRelationshipAdapter(adapter)).toThrow(/already registered/i);
  });

  it("requires explicit verified consent for cloned voice and human approval for AI scripts", () => {
    expect(() => assertVoiceGenerationAllowed({
      ownershipVerified: false,
      consentActive: true,
      revoked: false,
      useCase: "customer_support",
      sourceType: "human",
    })).toThrow(/ownership/i);
    expect(() => assertVoiceGenerationAllowed({
      ownershipVerified: true,
      consentActive: true,
      revoked: false,
      useCase: "financial_transfer_instruction",
      sourceType: "human",
    })).toThrow(/prohibited/i);
    expect(() => assertVoiceGenerationAllowed({
      ownershipVerified: true,
      consentActive: true,
      revoked: false,
      useCase: "customer_support",
      sourceType: "agent",
    })).toThrow(/human approval/i);
    expect(() => assertVoiceGenerationAllowed({
      ownershipVerified: true,
      consentActive: true,
      revoked: false,
      useCase: "customer_support",
      sourceType: "agent",
      approvedByUserId: 1,
    })).not.toThrow();
  });

  it("uses bounded retries and redacts provider credentials", () => {
    expect(relationshipDeliveryBackoffMs(1)).toBe(1_000);
    expect(relationshipDeliveryBackoffMs(20)).toBe(60 * 60_000);
    expect(relationshipDeliveryBackoffMs(2, 5_000)).toBe(5_000);
    expect(sanitizeRelationshipProviderError(new Error("Bearer abc.secret token=super-secret"))).not.toContain("super-secret");
    expect(sanitizeRelationshipProviderError(new Error("key sk_test_exampleCredential123"))).not.toContain("sk_test_exampleCredential123");
    expect(sanitizeRelationshipProviderError(new Error("-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----"))).not.toContain("secret");
    expect(() => assertRelationshipCapability({ "message.send": false }, "message.send")).toThrow(/does not support/i);
  });
});
