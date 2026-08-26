import { describe, expect, it } from "vitest";
import { assertMetaOutboundPolicy, whatsappTemplatePayload } from "../server/relationship-meta-policy";
import type { RelationshipOutboundAction } from "../server/relationship-hub-policy";

function action(overrides: Partial<RelationshipOutboundAction> = {}): RelationshipOutboundAction {
  return {
    version: "relationship.action.v1",
    actionType: "message.send",
    idempotencyKey: "meta-policy-test",
    externalThreadId: "customer-1",
    body: "Hello",
    bodyFormat: "plain",
    attachments: [],
    metadata: {},
    ...overrides,
  };
}

describe("Meta outbound policy", () => {
  const now = new Date("2026-08-26T20:00:00.000Z");

  it("allows standard replies only inside the rolling 24-hour window", () => {
    expect(() => assertMetaOutboundPolicy({ provider: "instagram", action: action(), latestInboundAt: new Date(now.getTime() - 23 * 60 * 60_000), now })).not.toThrow();
    expect(() => assertMetaOutboundPolicy({ provider: "messenger", action: action(), latestInboundAt: new Date(now.getTime() - 25 * 60 * 60_000), now })).toThrow(/reply window is closed/i);
    expect(() => assertMetaOutboundPolicy({ provider: "whatsapp", action: action(), latestInboundAt: null, now })).toThrow(/approved template/i);
  });

  it("allows approved WhatsApp template payloads outside the customer-service window", () => {
    const templateAction = action({ body: "", metadata: { whatsappTemplate: { name: "order_update", languageCode: "en_US", components: [{ type: "body", parameters: [{ type: "text", text: "1234" }] }] } } });
    expect(() => assertMetaOutboundPolicy({ provider: "whatsapp", action: templateAction, latestInboundAt: null, now })).not.toThrow();
    expect(whatsappTemplatePayload(templateAction)).toEqual({ type: "template", template: { name: "order_update", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type: "text", text: "1234" }] }] } });
  });

  it("fails closed when an Instagram private reply is older than seven days", () => {
    const privateReply = action({ actionType: "comment.private_reply", replyToExternalMessageId: "comment-1" });
    expect(() => assertMetaOutboundPolicy({ provider: "instagram", action: privateReply, latestInboundAt: new Date(now.getTime() - 8 * 24 * 60 * 60_000), now })).toThrow(/seven days/i);
  });
});
