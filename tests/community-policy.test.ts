import { describe, expect, it } from "vitest";
import {
  canAssignCommunityRole,
  canContributeToCommunity,
  canModerateCommunityMember,
  createCommunityChannelInputSchema,
  createCommunityInputSchema,
  updateCommunityMemberInputSchema,
} from "../server/community-policy";

describe("community operating policy", () => {
  const owner = { userId: 1, role: "owner" };
  const admin = { userId: 2, role: "admin" };
  const moderator = { userId: 3, role: "moderator" };
  const member = { userId: 4, role: "member" };

  it("preserves ownership while allowing delegated role operations", () => {
    expect(canAssignCommunityRole(owner, member, "admin")).toBe(true);
    expect(canAssignCommunityRole(admin, member, "moderator")).toBe(true);
    expect(canAssignCommunityRole(admin, moderator, "admin")).toBe(false);
    expect(canAssignCommunityRole(admin, owner, "member")).toBe(false);
    expect(canAssignCommunityRole(owner, owner, "member")).toBe(false);
  });

  it("limits moderation to non-manager members", () => {
    expect(canModerateCommunityMember(owner, member, "muted")).toBe(true);
    expect(canModerateCommunityMember(admin, moderator, "banned")).toBe(true);
    expect(canModerateCommunityMember(admin, admin, "banned")).toBe(false);
    expect(canModerateCommunityMember(owner, owner, "banned")).toBe(false);
  });

  it("blocks contribution for muted and banned members", () => {
    expect(canContributeToCommunity("active")).toBe(true);
    expect(canContributeToCommunity("muted")).toBe(false);
    expect(canContributeToCommunity("banned")).toBe(false);
  });

  it("accepts only bounded community creation fields", () => {
    const result = createCommunityInputSchema.safeParse({
      name: "  Creative Operators  ",
      description: "  A working community for distribution teams.  ",
      iconColor: "#27272a",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Creative Operators");
      expect(result.data.description).toBe(
        "A working community for distribution teams.",
      );
    }
    expect(
      createCommunityInputSchema.safeParse({
        name: "Creative Operators",
        description: "A working community.",
        iconColor: "#27272a",
        archivedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
    expect(
      createCommunityInputSchema.safeParse({
        name: "Creative Operators",
        description: "A working community.",
        iconColor: "not-a-color",
      }).success,
    ).toBe(false);
  });

  it("accepts only a bounded channel name and community id", () => {
    expect(
      createCommunityChannelInputSchema.safeParse({
        communityId: 4,
        name: "  announcements  ",
      }).success,
    ).toBe(true);
    expect(
      createCommunityChannelInputSchema.safeParse({
        communityId: 4,
        name: "announcements",
        role: "owner",
      }).success,
    ).toBe(false);
  });

  it("accepts exactly one bounded member-management operation", () => {
    expect(
      updateCommunityMemberInputSchema.safeParse({ role: "moderator" })
        .success,
    ).toBe(true);
    expect(
      updateCommunityMemberInputSchema.safeParse({
        status: "muted",
        reason: "Off-topic spam",
      }).success,
    ).toBe(true);
    expect(
      updateCommunityMemberInputSchema.safeParse({
        role: "admin",
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      updateCommunityMemberInputSchema.safeParse({
        status: "banned",
        reason: "x".repeat(501),
      }).success,
    ).toBe(false);
  });
});
