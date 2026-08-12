import { describe, expect, it } from "vitest";
import {
  insertCommunityMembershipSchema,
  insertCampaignSchema,
  insertPostSchema,
  insertPurchaseSchema,
  insertUserSchema,
} from "../shared/schema";

describe("current core data contracts", () => {
  it("requires an identity and public handle for a user", () => {
    expect(insertUserSchema.safeParse({
      clerkId: "user_test",
      username: "creative",
      displayName: "Creative",
    }).success).toBe(true);

    expect(insertUserSchema.safeParse({
      username: "creative",
      displayName: "Creative",
    }).success).toBe(false);
  });

  it("keeps post creation scoped to an owner", () => {
    expect(insertPostSchema.safeParse({
      userId: 1,
      content: "A durable post",
      mediaType: "text",
    }).success).toBe(true);

    expect(insertPostSchema.safeParse({ content: "Owner missing" }).success).toBe(false);
  });

  it("keeps membership and purchases scoped to the participating account", () => {
    expect(insertCommunityMembershipSchema.safeParse({
      userId: 1,
      communityId: 2,
      role: "member",
    }).success).toBe(true);

    expect(insertPurchaseSchema.safeParse({
      buyerId: 1,
      productId: 2,
      status: "active",
      paymentProvider: "demo",
    }).success).toBe(true);
  });

  it("keeps campaign operations bound to an owner and business", () => {
    expect(insertCampaignSchema.safeParse({
      businessId: "0d418dc3-36e2-4bd0-b109-3e65a47a164d",
      ownerUserId: 1,
      name: "Launch week",
      objective: "awareness",
      channel: "organic",
      status: "draft",
      budgetCents: 0,
    }).success).toBe(true);

    expect(insertCampaignSchema.safeParse({ name: "Unscoped campaign" }).success).toBe(false);
  });
});
