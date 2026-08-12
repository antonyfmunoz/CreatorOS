import { describe, expect, it } from "vitest";
import {
  matchesNativeSocialTrigger,
  messagingConsentCommand,
  NATIVE_COMMENT_CREATED_EVENT,
  NATIVE_DM_RECEIVED_EVENT,
  RELATIONSHIP_COMMENT_CREATED_EVENT,
  RELATIONSHIP_MESSAGE_RECEIVED_EVENT,
  validateNativeSocialTriggerConfig,
} from "../server/social-automation";

describe("native social automations", () => {
  it("matches comment keywords with explicit modes and scopes", () => {
    const payload = { content: "GUIDE", postId: 42, commentId: 9, parentId: null, actorUserId: 2 };
    expect(matchesNativeSocialTrigger({ eventType: NATIVE_COMMENT_CREATED_EVENT, keywords: ["guide"], matchMode: "exact", postId: 42 }, NATIVE_COMMENT_CREATED_EVENT, payload)).toBe(true);
    expect(matchesNativeSocialTrigger({ eventType: NATIVE_COMMENT_CREATED_EVENT, keywords: ["guide"], matchMode: "exact", postId: 41 }, NATIVE_COMMENT_CREATED_EVENT, payload)).toBe(false);
    expect(matchesNativeSocialTrigger({ eventType: NATIVE_COMMENT_CREATED_EVENT, keywords: ["guide"], matchMode: "contains" }, NATIVE_COMMENT_CREATED_EVENT, { ...payload, content: "Please send the guide" })).toBe(true);
    expect(matchesNativeSocialTrigger({ eventType: NATIVE_COMMENT_CREATED_EVENT, keywords: ["guide"] }, NATIVE_COMMENT_CREATED_EVENT, { ...payload, parentId: 3 })).toBe(false);
  });

  it("matches DMs but refuses automated and opted-out events", () => {
    const config = { eventType: NATIVE_DM_RECEIVED_EVENT, keywords: ["details"], matchMode: "starts_with" };
    expect(matchesNativeSocialTrigger(config, NATIVE_DM_RECEIVED_EVENT, { content: "Details please", actorUserId: 2 })).toBe(true);
    expect(matchesNativeSocialTrigger(config, NATIVE_DM_RECEIVED_EVENT, { content: "Details please", actorUserId: 2, automated: true })).toBe(false);
    expect(matchesNativeSocialTrigger(config, NATIVE_DM_RECEIVED_EVENT, { content: "Details please", actorUserId: 2, optedOut: true })).toBe(false);
  });

  it("uses the same keyword and safety semantics for connected channels", () => {
    const dm = { eventType: RELATIONSHIP_MESSAGE_RECEIVED_EVENT, keywords: ["pricing"], matchMode: "contains" };
    expect(matchesNativeSocialTrigger(dm, RELATIONSHIP_MESSAGE_RECEIVED_EVENT, { content: "Can I get pricing?", provider: "instagram" })).toBe(true);
    expect(matchesNativeSocialTrigger(dm, RELATIONSHIP_MESSAGE_RECEIVED_EVENT, { content: "Can I get pricing?", provider: "instagram", optedOut: true })).toBe(false);
    const comment = { eventType: RELATIONSHIP_COMMENT_CREATED_EVENT, keywords: ["guide"], matchMode: "exact" };
    expect(matchesNativeSocialTrigger(comment, RELATIONSHIP_COMMENT_CREATED_EVENT, { content: "guide", provider: "instagram" })).toBe(true);
    expect(matchesNativeSocialTrigger(comment, RELATIONSHIP_COMMENT_CREATED_EVENT, { content: "guide", provider: "instagram", parentId: "reply-1" })).toBe(false);
  });

  it("recognizes only explicit consent commands", () => {
    expect(messagingConsentCommand("STOP! ")).toBe("opt_out");
    expect(messagingConsentCommand("start")).toBe("opt_in");
    expect(messagingConsentCommand("please stop by tomorrow")).toBeNull();
  });

  it("requires bounded keyword configuration", () => {
    expect(() => validateNativeSocialTriggerConfig({ eventType: NATIVE_DM_RECEIVED_EVENT, keywords: [] })).toThrow(/keywords/i);
    expect(() => validateNativeSocialTriggerConfig({ eventType: NATIVE_DM_RECEIVED_EVENT, keywords: ["guide"], matchMode: "regex" })).toThrow(/matching/i);
    expect(() => validateNativeSocialTriggerConfig({ eventType: NATIVE_COMMENT_CREATED_EVENT, keywords: ["guide"], postId: -1 })).toThrow(/postId/i);
    expect(() => validateNativeSocialTriggerConfig({ eventType: NATIVE_DM_RECEIVED_EVENT, keywords: ["guide"], matchMode: "exact" })).not.toThrow();
  });
});
