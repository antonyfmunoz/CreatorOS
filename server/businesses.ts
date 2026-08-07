import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { businessMembers, businesses, type Business, type User } from "../shared/schema";

const DEFAULT_ROLE = "owner";

function defaultHandle(userId: number) {
  return `creator_${userId}_default`;
}

/**
 * Creator mode is intentionally low-friction: each account gets a default
 * business when it first enters the authenticated product. Later, creators can
 * create additional businesses and invite operators without changing their
 * public creator identity.
 */
export async function ensureDefaultBusiness(user: User): Promise<Business> {
  const [existing] = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.ownerUserId, user.id), eq(businesses.isDefault, true)))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(businesses)
    .values({
      ownerUserId: user.id,
      name: `${user.displayName}'s Business`,
      handle: defaultHandle(user.id),
      description: "",
      isDefault: true,
      status: "active",
    })
    .onConflictDoNothing()
    .returning();

  const business = created ?? (await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.ownerUserId, user.id), eq(businesses.isDefault, true)))
    .limit(1))[0];

  if (!business) {
    throw new Error("Unable to provision the default creator business");
  }

  await db
    .insert(businessMembers)
    .values({ businessId: business.id, userId: user.id, role: DEFAULT_ROLE })
    .onConflictDoNothing();

  return business;
}

export async function userCanManageBusiness(userId: number, businessId: string) {
  const [business] = await db
    .select({ ownerUserId: businesses.ownerUserId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return false;
  if (business.ownerUserId === userId) return true;

  const [membership] = await db
    .select({ role: businessMembers.role })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId)))
    .limit(1);

  return membership?.role === "owner" || membership?.role === "admin" || membership?.role === "operator";
}
