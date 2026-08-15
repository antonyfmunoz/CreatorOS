import { describe, expect, it } from "vitest";
import { deliverRelationshipAction } from "../server/relationship-channel-adapters";
import {
  nativeRelationshipAdapter,
  nativeRelationshipCapabilities,
} from "../server/relationship-native-adapter";

const context = {
  businessId: "business-native-contract",
  connectionId: "connection-native-contract",
  providerAccountId: "native",
  metadata: {},
};

describe("native relationship adapter capability contract", () => {
  it("advertises only outbound actions its provider-neutral dispatcher implements", async () => {
    expect(nativeRelationshipCapabilities["message.send"]).toBe(true);
    expect(nativeRelationshipCapabilities["message.edit"]).toBe(false);
    expect(nativeRelationshipCapabilities["message.delete"]).toBe(false);
    expect(nativeRelationshipCapabilities["message.react"]).toBe(false);
    expect(nativeRelationshipCapabilities["message.mark_read"]).toBe(false);

    await expect(deliverRelationshipAction(nativeRelationshipAdapter, {
      context,
      action: {
        version: "relationship.action.v1",
        actionType: "message.edit",
        idempotencyKey: "native-edit-not-advertised",
        externalThreadId: "1",
        body: "edited",
        bodyFormat: "plain",
        attachments: [],
        metadata: {},
      },
    })).rejects.toThrow("does not support message.edit");
  });
});
