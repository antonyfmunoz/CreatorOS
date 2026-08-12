import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../server/db";
import {
  accountPrivacyRequests,
  assets,
  businessMembers,
  businesses,
  conversationParticipants,
  conversations,
  directMessages,
  posts,
  socialConnections,
  users,
} from "../shared/schema";
import { buildAccountExport, executeAccountDeletionRequest } from "../server/account-privacy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function qualify() {
  if (process.env.QUALIFICATION_ISOLATED_DATABASE !== "true") throw new Error("Account privacy qualification requires an isolated disposable database");
  process.env.PRIVACY_SKIP_IDENTITY_PROVIDER = "true";
  const suffix = `${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const [user, contact] = await db.insert(users).values([
    { clerkId: `privacy_${suffix}`, authEmail: `privacy_${suffix}@example.invalid`, username: `privacy_${suffix}`, displayName: "Privacy qualification" },
    { clerkId: `privacy_contact_${suffix}`, authEmail: `privacy_contact_${suffix}@example.invalid`, username: `privacy_contact_${suffix}`, displayName: "Privacy contact" },
  ]).returning();
  const [business] = await db.insert(businesses).values({ ownerUserId: user.id, name: "Privacy qualification", handle: `privacy-${suffix}`, isDefault: true }).returning();
  await db.insert(businessMembers).values({ businessId: business.id, userId: user.id, role: "owner" });
  const [post] = await db.insert(posts).values({ userId: user.id, content: "Account export qualification", mediaType: "text" }).returning();
  await db.insert(assets).values({ ownerUserId: user.id, businessId: business.id, kind: "document", storageProvider: "local", storageKey: `private/${suffix}`, visibility: "private", originalFilename: "private.txt" });
  await db.insert(socialConnections).values({ userId: user.id, provider: "qualification", providerAccountId: suffix, providerAccountName: "Qualification", accessTokenCiphertext: "must-not-export" });
  const [conversation] = await db.insert(conversations).values({ isGroup: false }).returning();
  await db.insert(conversationParticipants).values([
    { conversationId: conversation.id, userId: user.id },
    { conversationId: conversation.id, userId: contact.id },
  ]);
  const [message] = await db.insert(directMessages).values({ conversationId: conversation.id, senderId: user.id, content: "Erase this authored message" }).returning();

  const accountExport = JSON.stringify(await buildAccountExport(user));
  assert(accountExport.includes(`\"id\":${post.id}`), "Account export omitted authored social content");
  assert(!accountExport.includes("must-not-export"), "Account export exposed encrypted token material");
  assert(!accountExport.includes(`private/${suffix}`), "Account export exposed a private storage locator");

  const [request] = await db.insert(accountPrivacyRequests).values({ userId: user.id, kind: "deletion", status: "scheduled", scheduledFor: new Date(Date.now() - 1_000), metadata: { qualification: true } }).returning();
  const outcome = await executeAccountDeletionRequest(request.id);
  assert(outcome.status === "completed", `Deletion qualification ended as ${outcome.status}`);
  const [deletedUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [deletedPost] = await db.select().from(posts).where(eq(posts.id, post.id)).limit(1);
  const [redactedMessage] = await db.select().from(directMessages).where(eq(directMessages.id, message.id)).limit(1);
  const [completedRequest] = await db.select().from(accountPrivacyRequests).where(eq(accountPrivacyRequests.id, request.id)).limit(1);
  assert(deletedUser.status === "deleted" && deletedUser.authEmail === null && deletedUser.displayName === "Deleted account", "Account identity was not pseudonymized");
  assert(deletedUser.clerkId.startsWith(`deleted_${user.id}_`), "Authentication identity was not tombstoned");
  assert(!deletedPost, "Authored post was not erased");
  assert(redactedMessage.content === "[deleted]", "Shared conversation message was not redacted");
  assert(completedRequest.status === "completed", "Privacy request did not retain completion evidence");

  console.log(JSON.stringify({ status: "qualified", exportComplete: true, secretSafe: true, ownershipPreflight: true, localErasure: true, sharedMessageRedaction: true, identityTombstone: true, durableEvidence: true }));
}

qualify().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
