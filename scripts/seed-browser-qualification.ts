#!/usr/bin/env tsx
import { db } from "../server/db";
import {
  businessMembers,
  businesses,
  assets,
  channels,
  channelMessages,
  communities,
  entitlements,
  notifications,
  posts,
  products,
  stories,
  users,
} from "../shared/schema";

if (process.env.QUALIFICATION_ISOLATED_DATABASE !== "true") {
  throw new Error("Browser fixtures may only be created in an isolated qualification database");
}

const [owner, peer, moderator, buyer, learner] = await db.insert(users).values([
  { clerkId: "qualification_owner", authEmail: "owner@example.invalid", username: "owner", displayName: "Owner Creative", bio: "Builds and distributes original work." },
  { clerkId: "qualification_peer", authEmail: "peer@example.invalid", username: "sarahmitchell", displayName: "Sarah Mitchell", bio: "Marketing strategist and creative collaborator." },
  { clerkId: "qualification_moderator", authEmail: "moderator@example.invalid", username: "moderator", displayName: "Community Moderator", bio: "Keeps community conversations useful and safe.", role: "admin" },
  { clerkId: "qualification_buyer", authEmail: "buyer@example.invalid", username: "buyer", displayName: "Marketplace Buyer", bio: "Discovers independent creative products." },
  { clerkId: "qualification_learner", authEmail: "learner@example.invalid", username: "learner", displayName: "Course Learner", bio: "Learns from working creatives." },
]).returning();

const actorIds = [owner.id, peer.id, moderator.id, buyer.id, learner.id];
if (actorIds.join(",") !== "1,2,3,4,5") {
  throw new Error(`Browser qualification requires a pristine isolated actor ledger; received ${actorIds.join(",")}`);
}

const [ownerBusiness, peerBusiness] = await db.insert(businesses).values([
  { ownerUserId: owner.id, name: "Owner Creative Studio", handle: "owner-creative-studio", isDefault: true },
  { ownerUserId: peer.id, name: "Sarah Mitchell Studio", handle: "sarah-mitchell-studio", isDefault: true },
]).returning();
await db.insert(businessMembers).values([
  { businessId: ownerBusiness.id, userId: owner.id, role: "owner" },
  { businessId: ownerBusiness.id, userId: moderator.id, role: "operator" },
  { businessId: peerBusiness.id, userId: peer.id, role: "owner" },
]);

await db.insert(assets).values([
  { ownerUserId: owner.id, businessId: ownerBusiness.id, kind: "video", storageProvider: "local", storageKey: "qualification/owner-public.mp4", publicUrl: "data:video/mp4;base64,AAAA", mimeType: "video/mp4", sizeBytes: 4, visibility: "public", status: "ready", originalFilename: "owner-public.mp4" },
  { ownerUserId: owner.id, businessId: ownerBusiness.id, kind: "video", storageProvider: "local", storageKey: "qualification/owner-private.mp4", mimeType: "video/mp4", sizeBytes: 4, visibility: "private", status: "ready", originalFilename: "owner-private.mp4" },
  { ownerUserId: peer.id, businessId: peerBusiness.id, kind: "video", storageProvider: "local", storageKey: "qualification/peer-public.mp4", publicUrl: "data:video/mp4;base64,AAAA", mimeType: "video/mp4", sizeBytes: 4, visibility: "public", status: "ready", originalFilename: "peer-public.mp4" },
  { ownerUserId: peer.id, businessId: peerBusiness.id, kind: "video", storageProvider: "local", storageKey: "qualification/peer-private.mp4", mimeType: "video/mp4", sizeBytes: 4, visibility: "private", status: "ready", originalFilename: "peer-private.mp4" },
]);

await db.insert(posts).values([
  { userId: peer.id, content: "Launching a field-tested distribution playbook for @owner.", mediaType: "text" },
  { userId: moderator.id, content: "Join our virtual hackathon and share what you are building.", mediaType: "text" },
]);
await db.insert(stories).values({
  userId: peer.id,
  mediaUrl: "data:text/plain;charset=utf-8,CreativesOS%20qualification%20story",
  mediaType: "text",
  caption: "A persisted qualification story",
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
});

const seededProducts = await db.insert(products).values([
  { userId: owner.id, businessId: ownerBusiness.id, title: "Independent Creator Toolkit", description: "A practical toolkit for running a creative business.", price: 29.99, category: "Template", status: "published", payoutMode: "platform" },
  { userId: owner.id, businessId: ownerBusiness.id, title: "Independent Creator Operations", description: "A complete course for operating a durable creative business.", price: 59.99, category: "Course", status: "published", payoutMode: "platform" },
  { userId: peer.id, businessId: peerBusiness.id, title: "Content Marketing Mastery", description: "A complete creator distribution course.", price: 49.99, category: "Course", status: "published", payoutMode: "platform" },
  { userId: peer.id, businessId: peerBusiness.id, title: "Campaign Launch Planner", description: "A reusable launch planning template.", price: 19.99, category: "Template", status: "published", payoutMode: "platform" },
]).returning();

const ownerCourse = seededProducts.find((product) => product.userId === owner.id && product.category === "Course")!;
const peerCourse = seededProducts.find((product) => product.userId === peer.id && product.category === "Course")!;
await db.insert(entitlements).values([
  { userId: learner.id, productId: ownerCourse.id, resourceType: "course", resourceId: String(ownerCourse.id), status: "active" },
  { userId: buyer.id, productId: peerCourse.id, resourceType: "course", resourceId: String(peerCourse.id), status: "active" },
]);

const [community] = await db.insert(communities).values({
  name: "Web Developers",
  description: "A working community for creators building on the web.",
  iconColor: "bg-green-500",
}).returning();
const [general] = await db.insert(channels).values({ communityId: community.id, name: "general" }).returning();
await db.insert(channels).values({ communityId: community.id, name: "introductions" });
await db.insert(channelMessages).values([
  { channelId: general.id, userId: peer.id, content: "I am organizing a virtual hackathon next month. Who wants to participate?" },
  { channelId: general.id, userId: moderator.id, content: "Welcome! Introduce yourself and tell us what you are creating.", isPinned: true },
]);

await db.insert(notifications).values([
  { userId: owner.id, type: "follow", message: "Sarah Mitchell followed you", relatedUserId: peer.id, linkTo: `/profile/${peer.id}`, sourceType: "qualification", sourceId: "follow" },
  { userId: owner.id, type: "comment", message: "Community Moderator commented on your post", relatedUserId: moderator.id, linkTo: "/post/1", sourceType: "qualification", sourceId: "comment" },
]);

console.log(JSON.stringify({
  status: "qualified",
  users: { owner: owner.id, peer: peer.id, moderator: moderator.id, buyer: buyer.id, learner: learner.id },
  businesses: { owner: ownerBusiness.id, peer: peerBusiness.id },
  community: community.id,
}));
process.exit(0);
