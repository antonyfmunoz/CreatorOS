import { describe, expect, it } from "vitest";
import { deliverRelationshipAction } from "../server/relationship-channel-adapters";
import {
  nativeRelationshipAdapter,
  nativeRelationshipCapabilities,
} from "../server/relationship-native-adapter";
import { relationshipOutboundActionSchema } from "../server/relationship-hub-policy";

const context = {
  businessId: "business-native-contract",
  connectionId: "connection-native-contract",
  providerAccountId: "native",
  metadata: {},
};

describe("native relationship adapter capability contract", () => {
  it("advertises the complete native message lifecycle", () => {
    expect(nativeRelationshipCapabilities["message.send"]).toBe(true);
    expect(nativeRelationshipCapabilities["message.edit"]).toBe(true);
    expect(nativeRelationshipCapabilities["message.delete"]).toBe(true);
    expect(nativeRelationshipCapabilities["message.react"]).toBe(true);
    expect(nativeRelationshipCapabilities["message.mark_read"]).toBe(true);
  });

  it("rejects message mutations without an authoritative target", async () => {
    const action = {
      version: "relationship.action.v1" as const,
      actionType: "message.edit" as const,
      idempotencyKey: "native-edit-needs-target",
      externalThreadId: "native:1",
      body: "edited",
      bodyFormat: "plain" as const,
      attachments: [],
      metadata: {},
    };
    expect(relationshipOutboundActionSchema.safeParse(action).success).toBe(false);
    await expect(deliverRelationshipAction(nativeRelationshipAdapter, {
      context,
      action,
    })).rejects.toThrow("requires a target message");
  });
});
