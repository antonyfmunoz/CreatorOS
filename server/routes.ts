import type { Express } from "express";
import { createServer, type Server } from "http";
import { createProductionBackup } from "./production-backup";
import { z } from "zod";
import { storage } from "./storage";
import OpenAI from "openai";
import {
  insertCommentSchema,
  insertStorySchema,
  insertSavedPostSchema,
  stories,
  savedPosts,
  taggedUsers,
  users,
  posts,
  comments,
  contentReports,
  postViews,
  postPolls,
  postPollOptions,
  postPollVotes,
  storyViews,
  storyReactions,
  playlists,
  playlistPosts,
  courseProgress,
  courseModules,
  courseLessons,
  courseAssessments,
  courseAssessmentAttempts,
  events,
  communities,
  eventAttendees,
  communityMemberships,
  communityModerationActions,
  communityRoomActionItems,
  communityRoomAgentSessions,
  communityRoomAiProfiles,
  communityRoomAttendees,
  communityRoomConsents,
  communityRoomInsights,
  communityRoomIntelligencePolicies,
  communityRoomNotes,
  communityRoomRecordings,
  communityRoomTranscriptSegments,
  communityRooms,
  distributionDeliveryAttempts,
  distributionJobs,
  socialConnections,
  socialOAuthStates,
  businessMembers,
  businesses,
  contentDrafts,
  assets,
  assetProductAccess,
  campaigns,
  campaignDeliverables,
  campaignMetrics,
  entitlements,
  orderItems,
  orders,
  products,
  productSaves,
  shoppingCartItems,
  productReviews,
  creatorPaymentAccounts,
  creatorEarningsAllocations,
  aiChats,
  channels,
  channelMessages,
  channelMessageLikes,
  channelPolls,
  channelPollOptions,
  channelPollVotes,
  automationContactStates,
  automationTriggerEvents,
  conversationParticipants,
  conversations,
  directMessages,
  notifications,
  followers,
} from "../shared/schema";
import { db } from "./db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { normalizeCartProductIds } from "../shared/cart";
import { normalizeProductCommercialTerms } from "../shared/product-catalog";
import { setupAuth, attachUser } from "./auth";
import { registerAutomationRoutes } from "./automation-routes";
import { registerRelationshipHubRoutes } from "./relationship-hub-routes";
import { registerAccountPrivacyRoutes } from "./account-privacy-routes";
import { registerCutStudioRoutes } from "./cut-studio";
import { registerBroadcastStudioRoutes } from "./broadcast-studio";
import { relationshipRoomContext } from "./relationship-room-context";
import {
  finalizeRelationshipUsage,
  relationshipOperationsSnapshot,
  releaseRelationshipUsage,
  reserveRelationshipUsage,
  RelationshipQuotaError,
} from "./relationship-operations";
import { syncLegacyNativeConversation } from "./relationship-native-sync";
import upload from "./upload";
import path from "path";
import fs from "fs";
import os from "os";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { emitProjectionEvent, registerUmhRoutes } from "./umh";
import { processDueDistributionJobs } from "./distribution";
import {
  isAuthorizedDistributionDispatch,
  isDistributionDispatchConfigured,
} from "./distribution-dispatch";
import { normalizePostLocation } from "./post-location";
import { normalizePostPoll, type NormalizedPostPoll } from "./post-polls";
import { buildTextStory, wantsStory } from "./text-story";
import { shouldCountStoryView } from "./story-views";
import { registerStripeRoutes, registerStripeWebhook } from "./stripe";
import {
  assetStorageReadiness,
  createDirectUpload,
  createPrivateAssetReadUrl,
  discardUploadedFiles,
  inspectDirectUpload,
  materializePrivateAsset,
  persistPrivateFile,
  persistUpload,
  removeStoredAsset,
} from "./asset-storage";
import { getReleaseReadiness } from "./release-readiness";
import { rankPostTopics } from "./search-discovery";
import {
  monthlyAssetQuotaFor,
  normalizeAssetVisibility,
  validateAssetUpload,
} from "./asset-policy";
import { assetUploadRateLimiter } from "./security";
import {
  aiChatMessageInputSchema,
  aiChatMessagesSchema,
  canManageAiAgent,
  canUseAiAgent,
  createAiAgentInputSchema,
  createAiChatInputSchema,
  updateAiAgentInputSchema,
} from "./ai-policy";
import {
  courseLessonUnlockAt,
  isCourseLessonUnlocked,
  learnerAssessmentQuestions,
  scoreCourseAssessment,
} from "./course-delivery";
import {
  canAssignCommunityRole,
  canContributeToCommunity,
  canModerateCommunityMember,
  createCommunityChannelInputSchema,
  createCommunityInputSchema,
  isCommunityMemberStatus,
  isCommunityRole,
  updateCommunityMemberInputSchema,
} from "./community-policy";
import {
  canRsvpToCommunityRoom,
  isCommunityRoomAttendanceStatus,
} from "./community-room-policy";
import {
  acceptedRoomInsightContent,
  activeRoomConsentCapabilities,
  canAccessRoomAiProfile,
  canViewRoomGuestBriefs,
  defaultRoomIntelligencePolicy,
  missingRoomConsentCapabilities,
  policyAllowsConsentCapability,
  roomAiProfileInputSchema,
  roomAiProfileStatusInputSchema,
  roomConsentInputSchema,
  roomInsightReviewInputSchema,
  roomIntelligencePolicyInputSchema,
} from "./room-intelligence-policy";
import { parseMarketplaceQuery } from "./marketplace-query";
import { normalizeSearchQuery } from "./search-query";
import {
  isSocialProviderConfigured,
  socialOAuthProviderForId,
  socialProviderDefinitions,
} from "../shared/social-distribution";
import {
  buildSocialOAuthAuthorizationUrl,
  createSocialOAuthState,
  decryptSocialToken,
  encryptSocialToken,
  hashSocialOAuthState,
  isSocialTokenEncryptionConfigured,
  socialOAuthRedirectUri,
} from "./social-oauth";
import {
  createLiveKitParticipantToken,
  dispatchLiveKitRoomAgent,
  getLiveKitAgentName,
  getLiveKitConfiguration,
  getLiveKitRecordingConfiguration,
  getLiveKitRoomParticipantState,
  liveKitProviderStatus,
  liveKitRecordingResult,
  liveKitRecordingStorageKey,
  liveKitRoomName,
  liveKitUserIdFromIdentity,
  removeLiveKitRoomParticipant,
  startLiveKitRoomRecording,
  stopLiveKitRoomAgent,
  stopLiveKitRoomRecording,
} from "./livekit";
import {
  configuredRoomMediaIngestSecret,
  missingParticipantConsentUserIds,
  roomTranscriptSegmentInputSchema,
  verifyRoomMediaIngest,
} from "./room-media";
import { reconcileRoomRecording } from "./room-media-reconciliation";
import {
  messagingConsentCommand,
  NATIVE_COMMENT_CREATED_EVENT,
  NATIVE_DM_RECEIVED_EVENT,
} from "./social-automation";

const communityRoomProviders = new Set([
  "manual_link",
  "google_meet",
  "zoom",
  "livekit",
]);
const communityRoomStatuses = new Set([
  "scheduled",
  "live",
  "ended",
  "canceled",
]);
const publicUserFields = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  bio: users.bio,
  profileLinks: users.profileLinks,
  profileImageUrl: users.profileImageUrl,
  role: users.role,
  xpPoints: users.xpPoints,
  level: users.level,
  createdAt: users.createdAt,
};

function parseRoomUrl(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_000) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function parseRoomDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

// Lazily construct the OpenAI client so a missing key doesn't crash server boot;
// AI chat routes fail with a clear error only when actually invoked without a key.
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

async function requirePostOwner(postId: number, userId: number) {
  const post = await storage.getPostById(postId);
  if (!post) {
    return { status: 404 as const, message: "Post not found" };
  }
  if (post.userId !== userId) {
    return {
      status: 403 as const,
      message: "You can only change your own posts",
    };
  }
  return { post };
}

async function requireDocumentOwner(documentId: number, userId: number) {
  const document = await storage.getDocumentById(documentId);
  if (!document) {
    return { status: 404 as const, message: "Document not found" };
  }
  if (document.userId !== userId) {
    return {
      status: 403 as const,
      message: "You can only access your own documents",
    };
  }
  return { document };
}

async function requireContactOwner(contactId: number, userId: number) {
  const contact = await storage.getContactById(contactId);
  if (!contact) {
    return { status: 404 as const, message: "Contact not found" };
  }
  if (contact.userId !== userId) {
    return {
      status: 403 as const,
      message: "You can only access your own contacts",
    };
  }
  return { contact };
}

function parseContactFields(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const contactName = typeof input.contactName === "string" ? input.contactName.trim() : "";
  const purchaseInfo = input.purchaseInfo === null || input.purchaseInfo === undefined || input.purchaseInfo === ""
    ? null
    : typeof input.purchaseInfo === "string"
      ? input.purchaseInfo.trim()
      : undefined;
  if (!contactName || contactName.length > 160 || purchaseInfo === undefined || (purchaseInfo?.length ?? 0) > 5_000) {
    return null;
  }
  return { contactName, purchaseInfo };
}

function parseDocumentFields(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content : "";
  if (!title || title.length > 200 || content.length > 200_000) return null;
  return { title, content };
}

async function requireCourseAccess(productId: number, userId: number) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product || !product.category.toLowerCase().includes("course"))
    return { status: 404 as const, message: "Course not found" };
  if (product.userId === userId)
    return { product, isOwner: true, enrollmentStartsAt: new Date(0) };
  const [entitlement] = await db
    .select({ id: entitlements.id, startsAt: entitlements.startsAt })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.productId, productId),
        eq(entitlements.status, "active"),
      ),
    )
    .limit(1);
  if (!entitlement)
    return { status: 403 as const, message: "Enroll to access this course" };
  return {
    product,
    isOwner: false,
    enrollmentStartsAt: entitlement.startsAt,
  };
}

async function createActivityNotification({
  recipientId,
  actorId,
  type,
  message,
  linkTo,
}: {
  recipientId: number;
  actorId: number;
  type: "like" | "comment" | "follow" | "purchase";
  message: string;
  linkTo: string;
}) {
  if (recipientId === actorId) return;

  const actor = await storage.getUser(actorId);
  if (!actor) return;

  await storage.createNotification({
    userId: recipientId,
    type,
    message,
    read: false,
    linkTo,
    relatedUserId: actor.id,
    relatedUserImage: actor.profileImageUrl ?? null,
  });
}

async function createPostPoll(postId: number, poll: NormalizedPostPoll) {
  const [created] = await db.insert(postPolls).values({ postId, question: poll.question }).returning();
  await db.insert(postPollOptions).values(poll.options.map((body, position) => ({ pollId: created.id, body, position })));
}

async function getPostPoll(postId: number, viewerUserId: number) {
  const [poll] = await db.select().from(postPolls).where(eq(postPolls.postId, postId)).limit(1);
  if (!poll) return null;
  const [options, votes] = await Promise.all([
    db.select().from(postPollOptions).where(eq(postPollOptions.pollId, poll.id)).orderBy(asc(postPollOptions.position)),
    db.select({ optionId: postPollVotes.optionId, userId: postPollVotes.userId }).from(postPollVotes).where(eq(postPollVotes.pollId, poll.id)),
  ]);
  const voteCounts = new Map<number, number>();
  for (const vote of votes) voteCounts.set(vote.optionId, (voteCounts.get(vote.optionId) ?? 0) + 1);
  return {
    id: poll.id,
    question: poll.question,
    totalVotes: votes.length,
    viewerOptionId: votes.find((vote) => vote.userId === viewerUserId)?.optionId ?? null,
    options: options.map((option) => ({ id: option.id, body: option.body, position: option.position, votes: voteCounts.get(option.id) ?? 0 })),
  };
}

async function getAccountCartItems(userId: number) {
  return db
    .select({
      id: products.id,
      title: products.title,
      price: products.price,
      category: products.category,
      imageUrl: products.imageUrl,
      creatorId: products.userId,
      creatorName: users.displayName,
      payoutMode: products.payoutMode,
    })
    .from(shoppingCartItems)
    .innerJoin(products, eq(shoppingCartItems.productId, products.id))
    .innerJoin(users, eq(products.userId, users.id))
    .where(
      and(
        eq(shoppingCartItems.userId, userId),
        eq(products.status, "published"),
        ne(products.userId, userId),
      ),
    )
    .orderBy(asc(shoppingCartItems.createdAt));
}

async function purchasableCartProductIds(userId: number, productIds: number[]) {
  if (!productIds.length) return [];
  const available = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        inArray(products.id, productIds),
        eq(products.status, "published"),
        ne(products.userId, userId),
      ),
    );
  const activeEntitlements = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.status, "active"),
        inArray(entitlements.productId, productIds),
      ),
    );
  const owned = new Set(activeEntitlements.map((item) => item.productId));
  return available
    .map((product) => product.id)
    .filter((productId) => !owned.has(productId));
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register Stripe's signature-verified webhook before Clerk middleware. It
  // does not use an end-user session and must receive the captured raw body.
  registerStripeWebhook(app);

  // Cloudflare Cron invokes this protected endpoint every minute. It exists
  // outside the Fly process so scheduled jobs continue to be dispatched after
  // the app has suspended. The scheduler capability cannot create, alter, or
  // access a user's jobs; it can only process jobs already due.
  app.post("/api/internal/distribution/dispatch", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isDistributionDispatchConfigured()) {
      return res.status(503).json({
        message: "Distribution dispatch is not configured",
      });
    }
    if (!isAuthorizedDistributionDispatch(req.get("authorization"))) {
      return res
        .status(401)
        .json({ message: "Unauthorized distribution dispatch" });
    }

    try {
      const processed = await processDueDistributionJobs();
      return res.json({ processed, dispatchedAt: new Date().toISOString() });
    } catch (error) {
      console.error("Durable distribution dispatch failed:", error);
      return res.status(500).json({
        message: "Distribution dispatch failed",
      });
    }
  });

  app.post("/api/internal/operations/backup", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isDistributionDispatchConfigured()) return res.status(503).json({ message: "Backup dispatch is not configured" });
    if (!isAuthorizedDistributionDispatch(req.get("authorization"))) return res.status(401).json({ message: "Unauthorized backup dispatch" });
    try {
      const result = await createProductionBackup();
      return res.json(result);
    } catch (error) {
      console.error("Production backup failed", { errorType: error instanceof Error ? error.name : typeof error });
      return res.status(500).json({ message: "Production backup failed" });
    }
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "creativesos" });
  });

  // Readiness confirms the data contracts this release depends on. Keep this
  // separate from liveness so Fly can restart a running process without
  // concealing a database or migration failure from production monitoring.
  app.get("/api/ready", async (_req, res) => {
    const requiredTables = [
      "businesses",
      "community_room_attendees",
      "content_drafts",
      "entitlements",
      "event_attendees",
      "post_views",
      "projection_events",
      "shopping_cart_items",
      "automation_definitions",
      "automation_runs",
      "automation_audit_events",
      "automation_action_receipts",
      "relationship_channel_connections",
      "relationships",
      "relationship_external_identities",
      "relationship_conversations",
      "relationship_messages",
      "relationship_delivery_jobs",
      "relationship_audit_events",
      "production_backups",
      "cut_studio_projects",
      "cut_studio_audio_templates",
      "cut_studio_jobs",
      "cut_studio_versions",
      "cut_studio_review_links",
      "cut_studio_review_comments",
      "cut_studio_review_decisions",
      "broadcast_studios",
      "broadcast_studio_versions",
      "broadcast_destinations",
      "broadcast_sessions",
      "broadcast_audience_messages",
      "broadcast_template_catalog",
    ];
    const requiredFederationColumns = [
      "projection_events.correlation_id",
      "projection_events.trace_id",
      "umh_commands.correlation_id",
      "umh_command_outcomes.correlation_id",
      "umh_audit_records.correlation_id",
    ];

    try {
      const rows = await db.execute(sql`
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (${sql.join(
            requiredTables.map((table) => sql`${table}`),
            sql`, `,
          )})
      `);
      const present = new Set(rows.map((row) => String(row.table_name)));
      const missing = requiredTables.filter((table) => !present.has(table));
      const columnRows = await db.execute(sql`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('projection_events', 'umh_commands', 'umh_command_outcomes', 'umh_audit_records')
          and column_name in ('correlation_id', 'trace_id')
      `);
      const presentColumns = new Set(
        columnRows.map(
          (row) => `${String(row.table_name)}.${String(row.column_name)}`,
        ),
      );
      const missingFederationColumns = requiredFederationColumns.filter(
        (column) => !presentColumns.has(column),
      );
      const assetStorage = assetStorageReadiness();

      if (
        missing.length > 0 ||
        missingFederationColumns.length > 0 ||
        !assetStorage.configured
      ) {
        return res.status(503).json({
          status: "not_ready",
          missing,
          missingFederationColumns,
          assetStorage,
        });
      }

      res.json({
        status: "ready",
        app: "creativesos",
        database: "ready",
        assetStorage,
        federationEvidence: { correlationStorage: "ready" },
        release: getReleaseReadiness(),
      });
    } catch (error) {
      console.error("Readiness check failed:", error);
      res.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });

  // Set up authentication routes and middleware
  setupAuth(app);
  registerAutomationRoutes(app);
  registerRelationshipHubRoutes(app);
  registerAccountPrivacyRoutes(app);
  registerCutStudioRoutes(app);
  registerBroadcastStudioRoutes(app);
  registerUmhRoutes(app);
  registerStripeRoutes(app);

  // prefix all routes with /api

  // User routes
  app.get("/api/users", async (req, res) => {
    try {
      const username = normalizeSearchQuery(req.query.username).toLowerCase();
      if (username) {
        const [matchedUser] = await db
          .select(publicUserFields)
          .from(users)
          .where(eq(users.username, username))
          .limit(1);
        return res.json(matchedUser ? [matchedUser] : []);
      }

      const search = normalizeSearchQuery(req.query.search);
      if (search) {
        const pattern = `%${search}%`;
        const matchedUsers = await db
          .select(publicUserFields)
          .from(users)
          .where(
            or(
              ilike(users.username, pattern),
              ilike(users.displayName, pattern),
            ),
          )
          .orderBy(desc(users.createdAt))
          .limit(8);
        return res.json(matchedUsers);
      }

      // This legacy discovery response is public and bounded. Targeted profile
      // and typeahead routes above should be used by application features.
      const allUsers = await db
        .select(publicUserFields)
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(24);
      res.json(allUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId < 1)
        return res.status(400).json({ message: "Invalid user" });
      const [user] = await db
        .select(publicUserFields)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/user/settings", attachUser, async (req, res) => {
    res.json({
      pushNotificationsEnabled: req.dbUser!.pushNotificationsEnabled,
      colorMode: req.dbUser!.colorMode,
    });
  });

  app.patch("/api/user/settings", attachUser, async (req, res) => {
    const result = z.object({
      pushNotificationsEnabled: z.boolean().optional(),
      colorMode: z.enum(["dark", "high_contrast"]).optional(),
    }).strict().refine(
      (value) => value.pushNotificationsEnabled !== undefined || value.colorMode !== undefined,
      "Provide at least one setting",
    ).safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: "Provide valid settings", issues: result.error.issues });
    }
    try {
      const updated = await storage.updateUser(req.dbUser!.id, result.data);
      res.json({
        pushNotificationsEnabled: updated.pushNotificationsEnabled,
        colorMode: updated.colorMode,
      });
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Public profile storefronts need only that creator's offers, never the
  // global marketplace catalog. Keep the response deliberately bounded.
  app.get("/api/users/:id/products", async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId < 1)
        return res.status(400).json({ message: "Invalid user" });
      const ownedProducts = await db
        .select({ product: products, user: publicUserFields })
        .from(products)
        .innerJoin(users, eq(products.userId, users.id))
        .where(
          and(
            eq(products.userId, userId),
            eq(products.status, "published"),
          ),
        )
        .orderBy(desc(products.createdAt))
        .limit(24);
      res.json(
        ownedProducts.map(({ product, user }) => ({ ...product, user })),
      );
    } catch {
      res.status(500).json({ message: "Failed to fetch profile products" });
    }
  });

  // Update user profile
  app.patch("/api/users/:id", attachUser, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // Only allow users to update their own profile
      if (req.dbUser!.id !== userId) {
        await discardUploadedFiles([req.file]);
        return res
          .status(403)
          .json({ message: "You can only update your own profile" });
      }

      const profilePatch = z.object({
        username: z.string().trim().min(3).max(20).regex(/^[a-z0-9_.]+$/).optional(),
        displayName: z.string().trim().min(2).max(30).optional(),
        bio: z.string().max(150).nullable().optional(),
        profileImageUrl: z.string().max(2_000).nullable().optional(),
        profileLinks: z.array(z.object({
          label: z.string().trim().min(1).max(40),
          url: z.string().url().max(2_000).refine((value) => {
            const protocol = new URL(value).protocol;
            return protocol === "https:" || protocol === "http:";
          }, "Profile links must use http or https"),
        })).max(5).optional(),
      }).strict().safeParse(req.body);
      if (!profilePatch.success) {
        return res.status(400).json({ message: "Provide valid profile fields", issues: profilePatch.error.issues });
      }
      const { username, displayName, bio, profileImageUrl, profileLinks } = profilePatch.data;

      // Only allow updating specific fields
      const userData: Partial<any> = {};
      if (username !== undefined) userData.username = username.toLowerCase();
      if (displayName !== undefined) userData.displayName = displayName;
      if (bio !== undefined) userData.bio = bio;
      if (profileLinks !== undefined) userData.profileLinks = profileLinks;
      if (profileImageUrl !== undefined)
        userData.profileImageUrl = profileImageUrl;

      const updatedUser = await storage.updateUser(userId, userData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      if ((error as { code?: string }).code === "23505") {
        return res.status(409).json({ message: "That username is already in use" });
      }
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  // Follower routes - follow a user
  app.post("/api/users/:id/follow", attachUser, async (req, res) => {
    try {
      const followerId = req.dbUser!.id;
      const followedId = parseInt(req.params.id);

      if (followerId === followedId) {
        return res.status(400).json({ message: "You cannot follow yourself" });
      }

      await storage.followUser(followerId, followedId);
      await createActivityNotification({
        recipientId: followedId,
        actorId: followerId,
        type: "follow",
        message: `${req.dbUser!.displayName} started following you`,
        linkTo: `/profile/${followerId}`,
      });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Failed to follow user" });
    }
  });

  // Unfollow a user
  app.post("/api/users/:id/unfollow", attachUser, async (req, res) => {
    try {
      const followerId = req.dbUser!.id;
      const followedId = parseInt(req.params.id);

      await storage.unfollowUser(followerId, followedId);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Failed to unfollow user" });
    }
  });

  // Get followers count for a user
  app.get("/api/users/:id/followers/count", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const count = await storage.getFollowerCount(userId);
      res.json(count);
    } catch (error) {
      console.error("Error getting follower count:", error);
      res.status(500).json({ message: "Failed to get follower count" });
    }
  });

  // Get following count for a user
  app.get("/api/users/:id/following/count", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const count = await storage.getFollowingCount(userId);
      res.json(count);
    } catch (error) {
      console.error("Error getting following count:", error);
      res.status(500).json({ message: "Failed to get following count" });
    }
  });

  // Get followers for a user
  app.get("/api/users/:id/followers", async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId < 1)
        return res.status(400).json({ message: "Invalid user" });
      const publicFollowers = await db
        .select(publicUserFields)
        .from(followers)
        .innerJoin(users, eq(followers.followerId, users.id))
        .where(eq(followers.followedId, userId))
        .orderBy(desc(users.createdAt))
        .limit(100);
      res.json(publicFollowers);
    } catch (error) {
      console.error("Error getting followers:", error);
      res.status(500).json({ message: "Failed to get followers" });
    }
  });

  // Get users a user is following
  app.get("/api/users/:id/following", async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId < 1)
        return res.status(400).json({ message: "Invalid user" });
      const publicFollowing = await db
        .select(publicUserFields)
        .from(followers)
        .innerJoin(users, eq(followers.followedId, users.id))
        .where(eq(followers.followerId, userId))
        .orderBy(desc(users.createdAt))
        .limit(100);
      res.json(publicFollowing);
    } catch (error) {
      console.error("Error getting following:", error);
      res.status(500).json({ message: "Failed to get following" });
    }
  });

  // Check if a user is following another user
  app.get(
    "/api/users/:id/is-following/:targetId",
    attachUser,
    async (req, res) => {
      try {
        const followerId = req.dbUser!.id;
        const followedId = parseInt(req.params.targetId);

        const isFollowing = await storage.isFollowing(followerId, followedId);
        res.json({ isFollowing });
      } catch (error) {
        console.error("Error checking follow status:", error);
        res.status(500).json({ message: "Failed to check follow status" });
      }
    },
  );

  // Upload profile image
  app.post(
    "/api/users/:id/profile-image",
    attachUser,
    upload.single("image"),
    async (req, res) => {
      try {
        const userId = parseInt(req.params.id);

        // Only allow users to update their own profile
        if (req.dbUser!.id !== userId) {
          return res
            .status(403)
            .json({ message: "You can only update your own profile" });
        }

        // Ensure the file was uploaded
        if (!req.file) {
          return res.status(400).json({ message: "No image file provided" });
        }

        const stored = await persistUpload(req.file, userId, "profile");

        // Update user profile with new image URL
        const updatedUser = await storage.updateUser(userId, {
          profileImageUrl: stored.publicUrl,
        });

        res.json({
          success: true,
          message: "Profile image uploaded successfully",
          user: updatedUser,
          imageUrl: stored.publicUrl,
        });
      } catch (error) {
        await discardUploadedFiles([req.file]);
        console.error("Error uploading profile image:", error);
        res.status(500).json({ message: "Failed to upload profile image" });
      }
    },
  );

  // Whop-style asset handshake: create a durable, policy-bearing record before
  // a browser uploads bytes directly to object storage. The client never sees
  // R2 credentials, and private files fail closed until a private bucket exists.
  app.post(
    "/api/assets/upload-intents",
    attachUser,
    assetUploadRateLimiter(),
    async (req, res) => {
      try {
        // The response contains a short-lived, bearer-style upload URL. Never
        // allow an intermediary or browser history cache to retain it.
        res.set("Cache-Control", "no-store");
        const kind = typeof req.body?.kind === "string" ? req.body.kind : "";
        const filename =
          typeof req.body?.filename === "string"
            ? req.body.filename.trim().slice(0, 255)
            : "";
        const mimeType =
          typeof req.body?.mimeType === "string"
            ? req.body.mimeType.toLowerCase().trim()
            : "";
        const sizeBytes =
          typeof req.body?.sizeBytes === "number"
            ? req.body.sizeBytes
            : Number(req.body?.sizeBytes);
        const visibility = normalizeAssetVisibility(
          req.body?.visibility ?? "public",
        );

        if (!filename || !visibility)
          return res.status(400).json({
            message: "A filename and public or private visibility are required",
          });
        const validationError = validateAssetUpload({
          kind,
          mimeType,
          sizeBytes,
          visibility,
        });
        if (validationError)
          return res.status(400).json({ message: validationError });

        const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
        const [usage] = await db
          .select({
            totalBytes: sql<number>`coalesce(sum(${assets.sizeBytes}), 0)`,
            totalAssets: count(),
          })
          .from(assets)
          .where(
            and(
              eq(assets.ownerUserId, req.dbUser!.id),
              gt(assets.createdAt, since),
              not(eq(assets.status, "deleted")),
            ),
          );
        const quota = monthlyAssetQuotaFor(kind);
        if (
          Number(usage?.totalBytes ?? 0) + sizeBytes > quota.maxBytes ||
          Number(usage?.totalAssets ?? 0) >= quota.maxAssets
        ) {
          return res.status(429).json({
            message:
              "Monthly asset quota reached. Upgrade or remove old assets before uploading more.",
          });
        }

        const direct = await createDirectUpload(
          req.dbUser!.id,
          kind,
          filename,
          mimeType,
          visibility,
        );
        const [asset] = await db
          .insert(assets)
          .values({
            ownerUserId: req.dbUser!.id,
            kind,
            storageProvider: direct.storageProvider,
            storageKey: direct.storageKey,
            mimeType,
            sizeBytes,
            visibility,
            status: "pending",
            originalFilename: filename,
            metadata: {
              uploadProtocol: "direct-r2",
              intendedSizeBytes: sizeBytes,
            },
          })
          .returning();
        return res.status(201).json({ asset, upload: direct });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to create upload intent";
        const status = /not configured|require R2/i.test(message) ? 503 : 500;
        console.error("Unable to create asset upload intent:", error);
        return res.status(status).json({ message });
      }
    },
  );

  app.post(
    "/api/assets/:id/complete",
    attachUser,
    assetUploadRateLimiter({ max: 60 }),
    async (req, res) => {
      try {
        const [asset] = await db
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, req.params.id),
              eq(assets.ownerUserId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (!asset) return res.status(404).json({ message: "Asset not found" });
        if (asset.status !== "pending")
          return res
            .status(409)
            .json({ message: "This asset is not awaiting completion" });
        const visibility = normalizeAssetVisibility(asset.visibility);
        if (!visibility)
          return res
            .status(500)
            .json({ message: "Asset has invalid visibility" });

        const stored = await inspectDirectUpload(asset.storageKey, visibility);
        const validationError = validateAssetUpload({
          kind: asset.kind,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          visibility,
        });
        if (validationError) {
          await removeStoredAsset(asset.storageKey, visibility).catch(
            (cleanupError) =>
              console.error("Failed to remove rejected asset:", cleanupError),
          );
          await db
            .update(assets)
            .set({
              status: "rejected",
              metadata: { ...asset.metadata, rejectionReason: validationError },
            })
            .where(eq(assets.id, asset.id));
          return res.status(400).json({ message: validationError });
        }

        const [completed] = await db
          .update(assets)
          .set({
            publicUrl: stored.publicUrl,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            status: "ready",
            metadata: {
              ...asset.metadata,
              completedAt: new Date().toISOString(),
            },
          })
          .where(eq(assets.id, asset.id))
          .returning();
        return res.json({ asset: completed });
      } catch (error) {
        console.error("Unable to complete asset upload:", error);
        return res
          .status(500)
          .json({ message: "Unable to verify uploaded asset" });
      }
    },
  );

  // Direct browser uploads remain the preferred path. This bounded fallback
  // keeps the library usable while a storage bucket's browser CORS policy is
  // being configured. It accepts only the same bounded media policy as direct
  // upload and can preserve private visibility for studio source material.
  app.post(
    "/api/assets/upload-proxy",
    attachUser,
    assetUploadRateLimiter(),
    upload.any(),
    async (req, res) => {
      const files = Array.isArray(req.files) ? req.files : [];
      try {
        const kind = typeof req.body?.kind === "string" ? req.body.kind : "";
        const visibility = normalizeAssetVisibility(req.body?.visibility ?? "public");
        const [file] = files;
        if (files.length !== 1 || !file)
          return res
            .status(400)
            .json({ message: "Upload exactly one media file" });
        if (!["photo", "video", "audio", "cut-lut"].includes(kind) || !visibility) {
          await discardUploadedFiles(files);
          return res
            .status(400)
            .json({ message: "This media type requires direct upload" });
        }
        const validationError = validateAssetUpload({
          kind,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          visibility,
        });
        if (validationError) {
          await discardUploadedFiles(files);
          return res.status(400).json({ message: validationError });
        }
        const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
        const [usage] = await db
          .select({
            totalBytes: sql<number>`coalesce(sum(${assets.sizeBytes}), 0)`,
            totalAssets: count(),
          })
          .from(assets)
          .where(
            and(
              eq(assets.ownerUserId, req.dbUser!.id),
              gt(assets.createdAt, since),
              not(eq(assets.status, "deleted")),
            ),
          );
        const quota = monthlyAssetQuotaFor(kind);
        if (
          Number(usage?.totalBytes ?? 0) + file.size > quota.maxBytes ||
          Number(usage?.totalAssets ?? 0) >= quota.maxAssets
        ) {
          await discardUploadedFiles(files);
          return res.status(429).json({
            message:
              "Monthly asset quota reached. Upgrade or remove old assets before uploading more.",
          });
        }
        const stored = visibility === "private"
          ? await persistPrivateFile({ sourcePath: file.path, ownerUserId: req.dbUser!.id, kind, filename: file.originalname, mimeType: file.mimetype })
          : await persistUpload(file, req.dbUser!.id, kind);
        if (visibility === "private") await discardUploadedFiles([file]);
        const [asset] = await db
          .insert(assets)
          .values({
            ownerUserId: req.dbUser!.id,
            kind,
            storageProvider: process.env.ASSET_STORAGE_PROVIDER ?? "local",
            storageKey: stored.storageKey,
            publicUrl: "publicUrl" in stored ? stored.publicUrl : null,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            visibility,
            originalFilename: file.originalname.slice(0, 255),
            metadata: { uploadProtocol: "server-proxy-cors-fallback", visibility },
            status: "ready",
          })
          .returning();
        return res.status(201).json({ asset });
      } catch (error) {
        await discardUploadedFiles(files);
        console.error("Unable to upload library asset through proxy:", error);
        return res.status(500).json({ message: "Unable to upload media" });
      }
    },
  );

  app.get("/api/assets", attachUser, async (req, res) => {
    try {
      const requestedVisibility = normalizeAssetVisibility(
        req.query.visibility,
      );
      if (req.query.visibility && !requestedVisibility)
        return res.status(400).json({ message: "Invalid asset visibility" });
      const conditions = [
        eq(assets.ownerUserId, req.dbUser!.id),
        ne(assets.status, "deleted"),
      ];
      if (requestedVisibility)
        conditions.push(eq(assets.visibility, requestedVisibility));
      const rows = await db
        .select()
        .from(assets)
        .where(and(...conditions))
        .orderBy(desc(assets.createdAt))
        .limit(200);
      return res.json(rows);
    } catch (error) {
      console.error("Unable to list assets:", error);
      return res.status(500).json({ message: "Unable to list assets" });
    }
  });

  app.post(
    "/api/products/:productId/assets/:assetId",
    attachUser,
    async (req, res) => {
      try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId) || productId <= 0)
          return res.status(400).json({ message: "Invalid product" });
        const [product] = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.id, productId),
              eq(products.userId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (!product)
          return res.status(404).json({ message: "Product not found" });
        const [asset] = await db
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, req.params.assetId),
              eq(assets.ownerUserId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (!asset || asset.status !== "ready")
          return res.status(404).json({ message: "Ready asset not found" });
        if (asset.visibility !== "private")
          return res.status(400).json({
            message: "Only private assets can be attached to paid delivery",
          });

        const [access] = await db
          .insert(assetProductAccess)
          .values({
            assetId: asset.id,
            productId: product.id,
            createdByUserId: req.dbUser!.id,
          })
          .onConflictDoNothing()
          .returning();
        return res.status(access ? 201 : 200).json({
          access: access ?? {
            assetId: asset.id,
            productId: product.id,
            status: "already_attached",
          },
        });
      } catch (error) {
        console.error("Unable to attach asset to product:", error);
        return res
          .status(500)
          .json({ message: "Unable to attach asset to product" });
      }
    },
  );

  app.get("/api/products/:productId/assets", attachUser, async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      if (!Number.isInteger(productId) || productId <= 0)
        return res.status(400).json({ message: "Invalid product" });
      const [product] = await db
        .select({ id: products.id, userId: products.userId })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      if (product.userId !== req.dbUser!.id) {
        const [entitlement] = await db
          .select({ id: entitlements.id })
          .from(entitlements)
          .where(
            and(
              eq(entitlements.productId, product.id),
              eq(entitlements.userId, req.dbUser!.id),
              eq(entitlements.status, "active"),
            ),
          )
          .limit(1);
        if (!entitlement)
          return res
            .status(403)
            .json({ message: "Purchase this offer to access its files" });
      }

      const rows = await db
        .select({
          id: assets.id,
          kind: assets.kind,
          mimeType: assets.mimeType,
          sizeBytes: assets.sizeBytes,
          originalFilename: assets.originalFilename,
          createdAt: assets.createdAt,
        })
        .from(assetProductAccess)
        .innerJoin(assets, eq(assets.id, assetProductAccess.assetId))
        .where(
          and(
            eq(assetProductAccess.productId, product.id),
            eq(assets.visibility, "private"),
            eq(assets.status, "ready"),
          ),
        )
        .orderBy(desc(assetProductAccess.createdAt));
      return res.json(rows);
    } catch (error) {
      console.error("Unable to list product assets:", error);
      return res.status(500).json({ message: "Unable to load offer files" });
    }
  });

  app.delete(
    "/api/products/:productId/assets/:assetId",
    attachUser,
    async (req, res) => {
      try {
        const productId = Number(req.params.productId);
        if (!Number.isInteger(productId) || productId <= 0)
          return res.status(400).json({ message: "Invalid product" });
        const [product] = await db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.id, productId),
              eq(products.userId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (!product)
          return res.status(404).json({ message: "Product not found" });
        await db
          .delete(assetProductAccess)
          .where(
            and(
              eq(assetProductAccess.productId, product.id),
              eq(assetProductAccess.assetId, req.params.assetId),
            ),
          );
        return res.status(204).send();
      } catch (error) {
        console.error("Unable to remove product asset:", error);
        return res.status(500).json({ message: "Unable to remove offer file" });
      }
    },
  );

  app.get("/api/assets/:id/access", attachUser, async (req, res) => {
    try {
      // Private delivery URLs are bearer credentials for their brief lifetime.
      res.set("Cache-Control", "no-store");
      const [asset] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, req.params.id))
        .limit(1);
      if (!asset || asset.status !== "ready")
        return res.status(404).json({ message: "Asset not found" });
      if (asset.visibility === "public")
        return res.json({ url: asset.publicUrl, expiresAt: null });
      if (asset.ownerUserId !== req.dbUser!.id) {
        const [entitledAccess] = await db
          .select({ id: assetProductAccess.id })
          .from(assetProductAccess)
          .innerJoin(
            entitlements,
            and(
              eq(entitlements.productId, assetProductAccess.productId),
              eq(entitlements.userId, req.dbUser!.id),
              eq(entitlements.status, "active"),
            ),
          )
          .where(eq(assetProductAccess.assetId, asset.id))
          .limit(1);
        if (!entitledAccess)
          return res
            .status(403)
            .json({ message: "You do not have access to this private asset" });
      }
      if (asset.storageProvider === "local" && process.env.NODE_ENV !== "production")
        return res.json({ url: `/api/assets/${asset.id}/stream`, expiresAt: null });
      return res.json(await createPrivateAssetReadUrl(asset.storageKey));
    } catch (error) {
      console.error("Unable to issue asset access URL:", error);
      return res.status(500).json({ message: "Unable to access asset" });
    }
  });

  app.get("/api/assets/:id/stream", attachUser, async (req, res) => {
    let temp: string | null = null;
    try {
      res.set("Cache-Control", "no-store");
      const [asset] = await db.select().from(assets).where(eq(assets.id, req.params.id)).limit(1);
      if (!asset || asset.status !== "ready" || asset.visibility !== "private") return res.status(404).json({ message: "Asset not found" });
      if (asset.ownerUserId !== req.dbUser!.id) {
        const [entitledAccess] = await db.select({ id: assetProductAccess.id }).from(assetProductAccess).innerJoin(entitlements, and(
          eq(entitlements.productId, assetProductAccess.productId),
          eq(entitlements.userId, req.dbUser!.id),
          eq(entitlements.status, "active"),
        )).where(eq(assetProductAccess.assetId, asset.id)).limit(1);
        if (!entitledAccess) return res.status(403).json({ message: "You do not have access to this private asset" });
      }
      temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "creativesos-private-asset-"));
      const outputPath = path.join(temp, asset.originalFilename?.replace(/[^A-Za-z0-9._-]/g, "-") || "asset.bin");
      await materializePrivateAsset(asset.storageKey, outputPath);
      res.type(asset.mimeType ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${path.basename(outputPath)}"`);
      res.sendFile(outputPath, { acceptRanges: true }, (error) => {
        if (temp) void fs.promises.rm(temp, { recursive: true, force: true });
        if (error && !res.headersSent) res.status(500).end();
      });
    } catch (error) {
      if (temp) await fs.promises.rm(temp, { recursive: true, force: true }).catch(() => undefined);
      console.error("Unable to stream private asset:", error);
      if (!res.headersSent) return res.status(500).json({ message: "Unable to stream asset" });
    }
  });

  app.delete(
    "/api/assets/:id",
    attachUser,
    assetUploadRateLimiter({ max: 60 }),
    async (req, res) => {
      try {
        const [asset] = await db
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, req.params.id),
              eq(assets.ownerUserId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (!asset) return res.status(404).json({ message: "Asset not found" });
        const visibility = normalizeAssetVisibility(asset.visibility);
        if (!visibility)
          return res
            .status(500)
            .json({ message: "Asset has invalid visibility" });
        await removeStoredAsset(asset.storageKey, visibility);
        await db
          .update(assets)
          .set({ status: "deleted", publicUrl: null, deleteAfter: new Date() })
          .where(eq(assets.id, asset.id));
        return res.status(204).end();
      } catch (error) {
        console.error("Unable to delete asset:", error);
        return res.status(500).json({ message: "Unable to delete asset" });
      }
    },
  );

  // Post routes
  app.get("/api/posts", async (req, res) => {
    try {
      const posts = await storage.getPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  // Business is the operational owner for commerce, distribution, and
  // communities. Creator profiles remain the public social identity.
  app.get("/api/businesses", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") return res.json([]);
      const memberships = await db
        .select({ businessId: businessMembers.businessId })
        .from(businessMembers)
        .where(eq(businessMembers.userId, req.dbUser!.id));
      const memberBusinessIds = memberships.map(
        (membership) => membership.businessId,
      );
      const owned = eq(businesses.ownerUserId, req.dbUser!.id);
      const scope = memberBusinessIds.length
        ? or(owned, inArray(businesses.id, memberBusinessIds))
        : owned;
      res.json(
        await db
          .select()
          .from(businesses)
          .where(scope)
          .orderBy(desc(businesses.createdAt)),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  app.post("/api/businesses", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res
          .status(501)
          .json({ message: "Business creation is unavailable in demo mode" });
      }
      const name =
        typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const rawHandle = (typeof req.body?.handle === "string" ? req.body.handle : name).slice(0, 128).toLowerCase();
      let handle = "";
      for (const character of rawHandle) {
        const isAsciiLetter = character >= "a" && character <= "z";
        const isDigit = character >= "0" && character <= "9";
        const normalized = isAsciiLetter || isDigit ? character : "_";
        if (normalized !== "_" || (handle && !handle.endsWith("_"))) handle += normalized;
      }
      handle = handle.replace(/^_/, "").replace(/_$/, "");
      const description =
        typeof req.body?.description === "string"
          ? req.body.description.trim()
          : "";
      if (!name || !handle)
        return res
          .status(400)
          .json({ message: "Business name and handle are required" });
      if (
        name.length > 120 ||
        handle.length > 48 ||
        description.length > 2_000
      ) {
        return res
          .status(400)
          .json({ message: "Business details exceed allowed length" });
      }
      const [business] = await db
        .insert(businesses)
        .values({
          ownerUserId: req.dbUser!.id,
          name,
          handle,
          description,
          logoUrl:
            typeof req.body?.logoUrl === "string" ? req.body.logoUrl : null,
          status: "active",
          isDefault: false,
        })
        .returning();
      await db.insert(businessMembers).values({
        businessId: business.id,
        userId: req.dbUser!.id,
        role: "owner",
      });
      res.status(201).json(business);
    } catch (error: any) {
      if (error?.code === "23505")
        return res
          .status(409)
          .json({ message: "That business handle is already in use" });
      res.status(500).json({ message: "Failed to create business" });
    }
  });

  app.get("/api/businesses/:id", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true")
        return res.status(404).json({ message: "Business not found" });
      const [business] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, req.params.id))
        .limit(1);
      if (!business)
        return res.status(404).json({ message: "Business not found" });
      const allowed = await userCanManageBusiness(req.dbUser!.id, business.id);
      if (!allowed)
        return res
          .status(403)
          .json({ message: "You do not have access to this business" });
      res.json(business);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch business" });
    }
  });

  app.get("/api/content-drafts", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") return res.json([]);
      res.json(
        await db
          .select()
          .from(contentDrafts)
          .where(eq(contentDrafts.userId, req.dbUser!.id))
          .orderBy(desc(contentDrafts.updatedAt)),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch content drafts" });
    }
  });

  app.get("/api/content-drafts/:id", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true")
        return res.status(404).json({ message: "Draft not found" });
      const [draft] = await db
        .select()
        .from(contentDrafts)
        .where(
          and(
            eq(contentDrafts.id, req.params.id),
            eq(contentDrafts.userId, req.dbUser!.id),
          ),
        )
        .limit(1);
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      res.json(draft);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch content draft" });
    }
  });

  app.post("/api/content-drafts", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res
          .status(501)
          .json({ message: "Draft persistence is unavailable in demo mode" });
      }
      const content =
        typeof req.body?.content === "string" ? req.body.content : "";
      const kind = typeof req.body?.kind === "string" ? req.body.kind : "post";
      const audience =
        typeof req.body?.audience === "string" ? req.body.audience : "public";
      const businessId =
        typeof req.body?.businessId === "string" ? req.body.businessId : null;
      if (content.length > 20_000 || kind.length > 48 || audience.length > 48) {
        return res
          .status(400)
          .json({ message: "Draft details exceed allowed length" });
      }
      if (
        businessId &&
        !(await userCanManageBusiness(req.dbUser!.id, businessId))
      ) {
        return res
          .status(403)
          .json({ message: "You do not have access to that business" });
      }
      const assetIds = Array.isArray(req.body?.assetIds)
        ? req.body.assetIds
            .filter((value: unknown) => typeof value === "string")
            .slice(0, 24)
        : [];
      const [draft] = await db
        .insert(contentDrafts)
        .values({
          userId: req.dbUser!.id,
          businessId,
          kind,
          content,
          assetIds,
          audience,
          platformVariants:
            req.body?.platformVariants &&
            typeof req.body.platformVariants === "object"
              ? req.body.platformVariants
              : {},
          scheduledFor: req.body?.scheduledFor
            ? new Date(req.body.scheduledFor)
            : null,
          status: "draft",
        })
        .returning();
      void emitProjectionEvent({
        aggregateType: "content_draft",
        aggregateId: draft.id,
        eventType: "content_draft.created",
        actorUserId: req.dbUser!.id,
        payload: { businessId, kind: draft.kind, origin: "creativesos" },
        idempotencyKey: `content_draft.created:${draft.id}`,
      }).catch((error) =>
        console.error("Failed to enqueue content-draft projection:", error),
      );
      res.status(201).json(draft);
    } catch (error) {
      res.status(500).json({ message: "Failed to save content draft" });
    }
  });

  app.patch("/api/content-drafts/:id", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true")
        return res
          .status(501)
          .json({ message: "Draft persistence is unavailable in demo mode" });
      const [existing] = await db
        .select()
        .from(contentDrafts)
        .where(
          and(
            eq(contentDrafts.id, req.params.id),
            eq(contentDrafts.userId, req.dbUser!.id),
          ),
        )
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Draft not found" });
      const content =
        typeof req.body?.content === "string"
          ? req.body.content
          : existing.content;
      if (content.length > 20_000)
        return res
          .status(400)
          .json({ message: "Draft content exceeds allowed length" });
      const [draft] = await db
        .update(contentDrafts)
        .set({
          content,
          kind:
            typeof req.body?.kind === "string" ? req.body.kind : existing.kind,
          audience:
            typeof req.body?.audience === "string"
              ? req.body.audience
              : existing.audience,
          assetIds: Array.isArray(req.body?.assetIds)
            ? req.body.assetIds
                .filter((value: unknown) => typeof value === "string")
                .slice(0, 24)
            : existing.assetIds,
          platformVariants:
            req.body?.platformVariants &&
            typeof req.body.platformVariants === "object"
              ? req.body.platformVariants
              : existing.platformVariants,
          scheduledFor:
            req.body?.scheduledFor === null
              ? null
              : req.body?.scheduledFor
                ? new Date(req.body.scheduledFor)
                : existing.scheduledFor,
          updatedAt: new Date(),
        })
        .where(eq(contentDrafts.id, existing.id))
        .returning();
      res.json(draft);
    } catch (error) {
      res.status(500).json({ message: "Failed to update content draft" });
    }
  });

  app.delete("/api/content-drafts/:id", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true")
        return res
          .status(501)
          .json({ message: "Draft persistence is unavailable in demo mode" });
      const deleted = await db
        .delete(contentDrafts)
        .where(
          and(
            eq(contentDrafts.id, req.params.id),
            eq(contentDrafts.userId, req.dbUser!.id),
          ),
        )
        .returning({ id: contentDrafts.id });
      if (!deleted.length)
        return res.status(404).json({ message: "Draft not found" });
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete content draft" });
    }
  });

  // Campaigns are the internal operating layer for launches, organic content,
  // paid-media planning, and creator seeding. Provider connections feed these
  // records later; they are never required to create or measure a campaign.
  app.get("/api/campaigns", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") return res.json([]);
      const memberships = await db
        .select({ businessId: businessMembers.businessId })
        .from(businessMembers)
        .where(eq(businessMembers.userId, req.dbUser!.id));
      const businessIds = memberships.map(
        (membership) => membership.businessId,
      );
      const scope = businessIds.length
        ? inArray(campaigns.businessId, businessIds)
        : eq(campaigns.ownerUserId, req.dbUser!.id);
      res.json(
        await db
          .select()
          .from(campaigns)
          .where(scope)
          .orderBy(desc(campaigns.updatedAt)),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true")
        return res.status(404).json({ message: "Campaign not found" });
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, req.params.id))
        .limit(1);
      if (!campaign)
        return res.status(404).json({ message: "Campaign not found" });
      if (!(await userCanManageBusiness(req.dbUser!.id, campaign.businessId)))
        return res
          .status(403)
          .json({ message: "You do not have access to this campaign" });
      const [deliverables, metrics] = await Promise.all([
        db
          .select()
          .from(campaignDeliverables)
          .where(eq(campaignDeliverables.campaignId, campaign.id))
          .orderBy(campaignDeliverables.dueAt),
        db
          .select()
          .from(campaignMetrics)
          .where(eq(campaignMetrics.campaignId, campaign.id))
          .orderBy(desc(campaignMetrics.capturedAt)),
      ]);
      res.json({ ...campaign, deliverables, metrics });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true")
        return res.status(501).json({
          message: "Campaign operations are unavailable in demo mode",
        });
      const name =
        typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const objective =
        typeof req.body?.objective === "string"
          ? req.body.objective
          : "awareness";
      const channel =
        typeof req.body?.channel === "string" ? req.body.channel : "organic";
      const description =
        typeof req.body?.description === "string"
          ? req.body.description.trim()
          : "";
      const allowedObjectives = new Set([
        "awareness",
        "engagement",
        "traffic",
        "conversion",
        "creator_seeding",
        "community",
      ]);
      const allowedChannels = new Set([
        "organic",
        "paid",
        "creator_seeding",
        "owned",
      ]);
      const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : null;
      const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;
      const budgetCents = Number.isInteger(req.body?.budgetCents)
        ? req.body.budgetCents
        : 0;
      if (
        !name ||
        name.length > 160 ||
        description.length > 10_000 ||
        !allowedObjectives.has(objective) ||
        !allowedChannels.has(channel) ||
        !Number.isFinite(budgetCents) ||
        budgetCents < 0 ||
        budgetCents > 100_000_000 ||
        (startsAt && Number.isNaN(startsAt.valueOf())) ||
        (endsAt && Number.isNaN(endsAt.valueOf())) ||
        (startsAt && endsAt && endsAt <= startsAt)
      ) {
        return res.status(400).json({ message: "Invalid campaign details" });
      }
      const requestedBusinessId =
        typeof req.body?.businessId === "string" ? req.body.businessId : null;
      const businessId =
        requestedBusinessId ?? (await ensureDefaultBusiness(req.dbUser!)).id;
      if (!(await userCanManageBusiness(req.dbUser!.id, businessId)))
        return res
          .status(403)
          .json({ message: "You do not have access to that business" });
      const [campaign] = await db
        .insert(campaigns)
        .values({
          businessId,
          ownerUserId: req.dbUser!.id,
          name,
          objective,
          channel,
          description,
          budgetCents,
          targeting:
            req.body?.targeting &&
            typeof req.body.targeting === "object" &&
            !Array.isArray(req.body.targeting)
              ? req.body.targeting
              : {},
          startsAt,
          endsAt,
          status: "draft",
        })
        .returning();
      void emitProjectionEvent({
        aggregateType: "campaign",
        aggregateId: campaign.id,
        eventType: "campaign.created",
        actorUserId: req.dbUser!.id,
        payload: { businessId, objective, channel },
        idempotencyKey: `campaign.created:${campaign.id}`,
      }).catch((error) =>
        console.error("Failed to enqueue campaign projection:", error),
      );
      res.status(201).json(campaign);
    } catch (error) {
      console.error("Failed to create campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  app.patch("/api/campaigns/:id", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true")
        return res.status(501).json({
          message: "Campaign operations are unavailable in demo mode",
        });
      const [existing] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, req.params.id))
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Campaign not found" });
      if (!(await userCanManageBusiness(req.dbUser!.id, existing.businessId)))
        return res
          .status(403)
          .json({ message: "You do not have access to this campaign" });
      const name =
        typeof req.body?.name === "string"
          ? req.body.name.trim()
          : existing.name;
      const description =
        typeof req.body?.description === "string"
          ? req.body.description.trim()
          : existing.description;
      const status =
        typeof req.body?.status === "string"
          ? req.body.status
          : existing.status;
      const allowedStatuses = new Set([
        "draft",
        "scheduled",
        "active",
        "paused",
        "completed",
        "archived",
      ]);
      const budgetCents = Number.isInteger(req.body?.budgetCents)
        ? req.body.budgetCents
        : existing.budgetCents;
      const startsAt =
        req.body?.startsAt === null
          ? null
          : req.body?.startsAt
            ? new Date(req.body.startsAt)
            : existing.startsAt;
      const endsAt =
        req.body?.endsAt === null
          ? null
          : req.body?.endsAt
            ? new Date(req.body.endsAt)
            : existing.endsAt;
      if (
        !name ||
        name.length > 160 ||
        description.length > 10_000 ||
        !allowedStatuses.has(status) ||
        !Number.isFinite(budgetCents) ||
        budgetCents < 0 ||
        budgetCents > 100_000_000 ||
        (startsAt && Number.isNaN(startsAt.valueOf())) ||
        (endsAt && Number.isNaN(endsAt.valueOf())) ||
        (startsAt && endsAt && endsAt <= startsAt)
      )
        return res.status(400).json({ message: "Invalid campaign details" });
      const [campaign] = await db
        .update(campaigns)
        .set({
          name,
          description,
          status,
          budgetCents,
          startsAt,
          endsAt,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, existing.id))
        .returning();
      if (status !== existing.status)
        void emitProjectionEvent({
          aggregateType: "campaign",
          aggregateId: campaign.id,
          eventType: "campaign.status_changed",
          actorUserId: req.dbUser!.id,
          payload: { from: existing.status, to: status },
          idempotencyKey: `campaign.status_changed:${campaign.id}:${status}`,
        }).catch((error) =>
          console.error("Failed to enqueue campaign status projection:", error),
        );
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  app.post("/api/campaigns/:id/deliverables", attachUser, async (req, res) => {
    try {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, req.params.id))
        .limit(1);
      if (!campaign)
        return res.status(404).json({ message: "Campaign not found" });
      if (!(await userCanManageBusiness(req.dbUser!.id, campaign.businessId)))
        return res
          .status(403)
          .json({ message: "You do not have access to this campaign" });
      const title =
        typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const channel =
        typeof req.body?.channel === "string"
          ? req.body.channel.trim()
          : "CreativesOS";
      const dueAt = req.body?.dueAt ? new Date(req.body.dueAt) : null;
      if (
        !title ||
        title.length > 240 ||
        channel.length > 80 ||
        (dueAt && Number.isNaN(dueAt.valueOf()))
      )
        return res.status(400).json({ message: "Invalid deliverable" });
      const [deliverable] = await db
        .insert(campaignDeliverables)
        .values({
          campaignId: campaign.id,
          title,
          channel,
          dueAt,
          notes:
            typeof req.body?.notes === "string"
              ? req.body.notes.trim().slice(0, 10_000)
              : "",
        })
        .returning();
      res.status(201).json(deliverable);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Failed to create campaign deliverable" });
    }
  });

  app.patch(
    "/api/campaigns/:id/deliverables/:deliverableId",
    attachUser,
    async (req, res) => {
      try {
        const [campaign] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, req.params.id))
          .limit(1);
        if (!campaign)
          return res.status(404).json({ message: "Campaign not found" });
        if (!(await userCanManageBusiness(req.dbUser!.id, campaign.businessId)))
          return res
            .status(403)
            .json({ message: "You do not have access to this campaign" });
        const [existing] = await db
          .select()
          .from(campaignDeliverables)
          .where(
            and(
              eq(campaignDeliverables.id, req.params.deliverableId),
              eq(campaignDeliverables.campaignId, campaign.id),
            ),
          )
          .limit(1);
        if (!existing)
          return res
            .status(404)
            .json({ message: "Campaign deliverable not found" });
        const status =
          typeof req.body?.status === "string"
            ? req.body.status
            : existing.status;
        if (
          !new Set([
            "planned",
            "in_progress",
            "ready",
            "published",
            "cancelled",
          ]).has(status)
        )
          return res
            .status(400)
            .json({ message: "Invalid deliverable status" });
        const [deliverable] = await db
          .update(campaignDeliverables)
          .set({ status, updatedAt: new Date() })
          .where(eq(campaignDeliverables.id, existing.id))
          .returning();
        res.json(deliverable);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to update campaign deliverable" });
      }
    },
  );

  app.post("/api/campaigns/:id/metrics", attachUser, async (req, res) => {
    try {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, req.params.id))
        .limit(1);
      if (!campaign)
        return res.status(404).json({ message: "Campaign not found" });
      if (!(await userCanManageBusiness(req.dbUser!.id, campaign.businessId)))
        return res
          .status(403)
          .json({ message: "You do not have access to this campaign" });
      const numericFields = [
        "impressions",
        "engagements",
        "clicks",
        "conversions",
        "spendCents",
        "attributedRevenueCents",
      ] as const;
      const values = Object.fromEntries(
        numericFields.map((field) => [
          field,
          Number.isInteger(req.body?.[field]) ? req.body[field] : 0,
        ]),
      ) as Record<(typeof numericFields)[number], number>;
      if (
        numericFields.some(
          (field) => values[field] < 0 || values[field] > 2_000_000_000,
        )
      )
        return res.status(400).json({
          message: "Campaign metrics must be non-negative whole numbers",
        });
      const [metric] = await db
        .insert(campaignMetrics)
        .values({
          campaignId: campaign.id,
          ...values,
          source:
            typeof req.body?.source === "string"
              ? req.body.source.slice(0, 80)
              : "manual",
        })
        .returning();
      void emitProjectionEvent({
        aggregateType: "campaign",
        aggregateId: campaign.id,
        eventType: "campaign.metrics_logged",
        actorUserId: req.dbUser!.id,
        payload: { source: metric.source },
        idempotencyKey: `campaign.metrics_logged:${metric.id}`,
      }).catch((error) =>
        console.error("Failed to enqueue campaign metric projection:", error),
      );
      res.status(201).json(metric);
    } catch (error) {
      res.status(500).json({ message: "Failed to record campaign metrics" });
    }
  });

  app.get("/api/assets", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") return res.json([]);
      res.json(
        await db
          .select()
          .from(assets)
          .where(eq(assets.ownerUserId, req.dbUser!.id))
          .orderBy(desc(assets.createdAt)),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      const post = await storage.getPostById(parseInt(req.params.id));
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.get("/api/posts/:postId/poll", attachUser, async (req, res) => {
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) return res.status(400).json({ message: "Invalid post" });
    const post = await storage.getPostById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(await getPostPoll(postId, req.dbUser!.id));
  });

  app.post("/api/posts/:postId/poll/vote", attachUser, async (req, res) => {
    const postId = Number(req.params.postId);
    const optionId = Number(req.body?.optionId);
    if (!Number.isInteger(postId) || !Number.isInteger(optionId)) return res.status(400).json({ message: "A valid poll option is required" });
    const [selection] = await db.select({ pollId: postPolls.id, optionId: postPollOptions.id })
      .from(postPolls)
      .innerJoin(postPollOptions, eq(postPollOptions.pollId, postPolls.id))
      .where(and(eq(postPolls.postId, postId), eq(postPollOptions.id, optionId)))
      .limit(1);
    if (!selection) return res.status(404).json({ message: "Poll option not found" });
    await db.transaction(async (tx) => {
      await tx.delete(postPollVotes).where(and(eq(postPollVotes.pollId, selection.pollId), eq(postPollVotes.userId, req.dbUser!.id)));
      await tx.insert(postPollVotes).values({ pollId: selection.pollId, optionId, userId: req.dbUser!.id });
    });
    res.json(await getPostPoll(postId, req.dbUser!.id));
  });

  // Provider-neutral location discovery. Suggestions are derived only from
  // locations creators actually used; clients can also enter a new label.
  app.get("/api/locations", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const rows = await db.select({ location: posts.location })
      .from(posts)
      .where(isNotNull(posts.location))
      .orderBy(desc(posts.createdAt))
      .limit(500);
    const counts = new Map<string, { name: string; postCount: number }>();
    for (const row of rows) {
      const name = row.location?.trim();
      if (!name || (query && !name.toLowerCase().includes(query))) continue;
      const key = name.toLowerCase();
      const existing = counts.get(key);
      counts.set(key, { name: existing?.name ?? name, postCount: (existing?.postCount ?? 0) + 1 });
    }
    res.json(Array.from(counts.values()).sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name)).slice(0, 30));
  });

  app.post("/api/posts", attachUser, async (req, res) => {
    try {
      let poll: NormalizedPostPoll | null;
      try {
        poll = normalizePostPoll(req.body?.pollData);
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid poll" });
      }
      // Add authenticated user's ID to the post data
      const { pollData: _pollData, addToStory, ...postBody } = req.body ?? {};
      const postData = {
        ...postBody,
        userId: req.dbUser!.id,
      };

      if (postData.repostOfId !== undefined && postData.repostOfId !== null) {
        const sourceId = Number(postData.repostOfId);
        if (!Number.isInteger(sourceId) || sourceId <= 0) {
          return res.status(400).json({ message: "A valid original post is required" });
        }
        const source = await storage.getPostById(sourceId);
        if (!source) return res.status(404).json({ message: "Original post not found" });
        if (source.repostOfId !== null && source.repostOfId !== undefined) {
          return res.status(409).json({ message: "A repost cannot be reposted again" });
        }
        const existingRepost = (await storage.getPostsByUserId(req.dbUser!.id))
          .some((candidate) => candidate.repostOfId === sourceId);
        if (existingRepost) {
          return res.status(409).json({ message: "You already reposted this post" });
        }
      }

      const post = await storage.createPost(postData);
      if (poll && process.env.CREATOROS_DEMO_MODE !== "true") {
        try {
          await createPostPoll(post.id, poll);
        } catch (error) {
          await storage.deletePost(post.id);
          throw error;
        }
      }
      if (wantsStory(addToStory)) {
        try {
          const storyData = buildTextStory(req.dbUser!.id, post.content);
          await storage.createStory(insertStorySchema.parse(storyData));
        } catch (error) {
          await storage.deletePost(post.id);
          throw error;
        }
      }
      void emitProjectionEvent({
        aggregateType: "post",
        aggregateId: post.id,
        eventType: "post.published",
        actorUserId: req.dbUser!.id,
        payload: { mediaType: post.mediaType ?? "text" },
        idempotencyKey: `post.published:${post.id}`,
      }).catch((error) =>
        console.error("Failed to enqueue post projection:", error),
      );
      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  // Handle media post uploads (image, audio, video)
  app.post("/api/posts/:id/report", attachUser, async (req, res) => {
    try {
      const postId = Number(req.params.id);
      const post = Number.isInteger(postId)
        ? await storage.getPostById(postId)
        : undefined;
      if (!post) return res.status(404).json({ message: "Post not found" });
      if (post.userId === req.dbUser!.id)
        return res
          .status(400)
          .json({ message: "You cannot report your own post" });
      const reason =
        typeof req.body?.reason === "string"
          ? req.body.reason.trim().slice(0, 80)
          : "safety_concern";
      const details =
        typeof req.body?.details === "string"
          ? req.body.details.trim().slice(0, 2000)
          : "";
      const [report] = await db
        .insert(contentReports)
        .values({
          reporterUserId: req.dbUser!.id,
          targetType: "post",
          targetId: String(postId),
          reason: reason || "safety_concern",
          details,
        })
        .returning();
      res.status(201).json({ id: report.id, status: report.status });
    } catch {
      res.status(500).json({ message: "Could not submit report" });
    }
  });

  app.get("/api/moderation/reports", attachUser, async (req, res) => {
    if (req.dbUser!.role !== "admin")
      return res.status(403).json({ message: "Administrator access required" });
    const status =
      typeof req.query.status === "string" ? req.query.status : "open";
    const reports = await db
      .select()
      .from(contentReports)
      .where(eq(contentReports.status, status))
      .orderBy(desc(contentReports.createdAt))
      .limit(100);
    res.json(reports);
  });

  app.patch("/api/moderation/reports/:id", attachUser, async (req, res) => {
    if (req.dbUser!.role !== "admin")
      return res.status(403).json({ message: "Administrator access required" });
    const status = typeof req.body?.status === "string" ? req.body.status : "";
    if (!new Set(["open", "reviewing", "resolved", "dismissed"]).has(status))
      return res.status(400).json({ message: "Invalid report status" });
    const [report] = await db
      .update(contentReports)
      .set({ status, reviewerUserId: req.dbUser!.id, reviewedAt: new Date() })
      .where(eq(contentReports.id, req.params.id))
      .returning();
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  });

  app.post("/api/posts/media", attachUser, upload.any(), async (req, res) => {
    try {
      const content = typeof req.body?.content === "string" ? req.body.content : "";
      const mediaType = typeof req.body?.mediaType === "string" ? req.body.mediaType : "";
      const isCarousel = typeof req.body?.isCarousel === "string" ? req.body.isCarousel : "false";
      const addToStory = typeof req.body?.addToStory === "string" ? req.body.addToStory : "false";
      const userId = req.dbUser!.id;
      const files = Array.isArray(req.files) ? req.files : [];

      if (!content) {
        await discardUploadedFiles(files);
        return res.status(400).json({ message: "Content is required" });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No media file provided" });
      }

      if (mediaType && !["photo", "audio", "video"].includes(mediaType)) {
        await discardUploadedFiles(files);
        return res.status(400).json({ message: "Invalid media type provided" });
      }

      let poll: NormalizedPostPoll | null;
      try {
        poll = normalizePostPoll(req.body.pollData);
      } catch (error) {
        await discardUploadedFiles(files);
        return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid poll" });
      }

      const uploadedFiles = await Promise.all(
        files.map((file) => persistUpload(file, userId, mediaType || "photo")),
      );

      const postData: any = {
        userId: userId,
        content,
        mediaType: mediaType || "photo",
        location: normalizePostLocation(req.body.location),
      };

      // Check if this is a carousel post (multiple images)
      const isCarouselPost = isCarousel === "true";

      // Process the media file path(s) based on media type
      let primaryMediaPath = "";

      if (mediaType === "photo" || !mediaType) {
        if (isCarouselPost && files.length > 1) {
          // Handle carousel post (multiple images)
          const imagePaths = uploadedFiles.map((file) => file.publicUrl);

          // Store primary image in imageUrl
          postData.imageUrl = imagePaths[0];
          primaryMediaPath = imagePaths[0];

          // Store all images as JSON in a new carouselImages field
          postData.carouselImages = JSON.stringify(imagePaths);
        } else {
          // Handle single image post
          const imagePath = uploadedFiles[0].publicUrl;
          postData.imageUrl = imagePath;
          primaryMediaPath = imagePath;
          // Ensure carouselImages is null for single image posts
          postData.carouselImages = null;
        }
        postData.mediaType = "photo";
      } else if (mediaType === "audio") {
        // Handle audio post
        const audioPath = uploadedFiles[0].publicUrl;
        postData.audioUrl = audioPath;
        primaryMediaPath = audioPath;
        postData.mediaType = "audio";
      } else if (mediaType === "video") {
        // Handle video post
        const videoPath = uploadedFiles[0].publicUrl;
        postData.videoUrl = videoPath;
        primaryMediaPath = videoPath;
        postData.mediaType = "video";
      }

      // Create the post first
      const post = await storage.createPost(postData);
      if (poll && process.env.CREATOROS_DEMO_MODE !== "true") {
        try {
          await createPostPoll(post.id, poll);
        } catch (error) {
          await storage.deletePost(post.id);
          throw error;
        }
      }

      // Keep a durable asset record alongside legacy local uploads. The storage
      // key is provider-neutral, so an R2/S3 migration can move bytes without
      // changing draft or distribution references.
      let publishedAssets: unknown[] = [];
      if (process.env.CREATOROS_DEMO_MODE !== "true") {
        try {
          publishedAssets = await Promise.all(
            files.map(async (file, index) => {
              const uploadedFile = uploadedFiles[index];
              const [asset] = await db
                .insert(assets)
                .values({
                  ownerUserId: userId,
                  kind: postData.mediaType,
                  storageProvider:
                    process.env.ASSET_STORAGE_PROVIDER ?? "local",
                  storageKey: uploadedFile.storageKey,
                  publicUrl: uploadedFile.publicUrl,
                  mimeType: file.mimetype,
                  sizeBytes: file.size,
                  visibility: "public",
                  originalFilename: file.originalname.slice(0, 255),
                  metadata: {
                    originalName: file.originalname,
                    postId: post.id,
                    uploadProtocol: "server-proxy",
                  },
                  status: "ready",
                })
                .returning();
              return asset;
            }),
          );
        } catch (assetError) {
          console.error(
            "Post published but asset registration failed:",
            assetError,
          );
        }
      }

      // Check if we should add this to the user's story
      if (addToStory === "true") {
        console.log("Adding to story:", {
          userId,
          mediaPath: primaryMediaPath,
        });
        try {
          // Create a story with the same media
          await storage.createStory({
            userId: userId,
            mediaUrl: primaryMediaPath,
            mediaType: postData.mediaType,
            caption: content || null,
          });
          console.log("Successfully added to story");
        } catch (storyError) {
          console.error("Error adding to story:", storyError);
          // Continue even if story creation fails, the post is already created
        }
      }

      // Process tagged users if present
      if (req.body.taggedUsers) {
        try {
          console.log("Tagged users data from request:", req.body.taggedUsers);

          const taggedUsersData = JSON.parse(req.body.taggedUsers);
          console.log("Parsed tagged users data:", taggedUsersData);

          if (Array.isArray(taggedUsersData) && taggedUsersData.length > 0) {
            // Insert each tagged user into the database
            for (const taggedUser of taggedUsersData) {
              console.log("Processing tagged user:", taggedUser);

              try {
                await db.insert(taggedUsers).values({
                  postId: post.id,
                  userId: taggedUser.id,
                  positionX: taggedUser.positionX,
                  positionY: taggedUser.positionY,
                });
                console.log(
                  `Successfully added tagged user ${taggedUser.id} to post ${post.id}`,
                );
              } catch (insertError) {
                console.error("Error inserting tagged user", {
                  taggedUserId: Number(taggedUser.id),
                  postId: post.id,
                  errorType: insertError instanceof Error ? insertError.name : typeof insertError,
                });
              }
            }
            console.log(
              `Attempted to add ${taggedUsersData.length} tagged users to post ${post.id}`,
            );
          } else {
            console.log("No valid tagged users data found in the array");
          }
        } catch (tagError) {
          console.error("Error processing tagged users:", tagError);
          // Continue even if tagging fails, the post is already created
        }
      } else {
        console.log("No tagged users found in request body");
      }

      res.status(201).json({ ...post, assets: publishedAssets });
    } catch (error) {
      await discardUploadedFiles(Array.isArray(req.files) ? req.files : []);
      console.error("Error creating media post:", error);
      res.status(500).json({ message: "Failed to create media post" });
    }
  });

  // Tagged users API endpoint
  app.post("/api/posts/:postId/tagged-users", attachUser, async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const { userId, positionX, positionY } = req.body;

      const ownership = await requirePostOwner(postId, req.dbUser!.id);
      if (!("post" in ownership)) {
        return res
          .status(ownership.status)
          .json({ message: ownership.message });
      }

      // Validate required fields
      if (!userId || positionX === undefined || positionY === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Create the tagged user
      const taggedUser = await db
        .insert(taggedUsers)
        .values({
          postId,
          userId,
          positionX,
          positionY,
        })
        .returning();

      res.status(201).json(taggedUser[0]);
    } catch (error) {
      console.error("Error adding tagged user:", error);
      res.status(500).json({ message: "Failed to add tagged user" });
    }
  });

  app.post("/api/posts/:id/like", attachUser, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const existingPost = await storage.getPostById(postId);
      if (!existingPost)
        return res.status(404).json({ message: "Post not found" });

      const added = await storage.addPostLike(req.dbUser!.id, postId);
      const post = added ? await storage.likePost(postId) : existingPost;
      if (added)
        await createActivityNotification({
          recipientId: existingPost.userId,
          actorId: req.dbUser!.id,
          type: "like",
          message: `${req.dbUser!.displayName} liked your post`,
          linkTo: `/profile/${existingPost.userId}`,
        });
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to like post" });
    }
  });

  app.post("/api/posts/:id/unlike", attachUser, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const existingPost = await storage.getPostById(postId);
      if (!existingPost)
        return res.status(404).json({ message: "Post not found" });
      const removed = await storage.removePostLike(req.dbUser!.id, postId);
      const post = removed ? await storage.unlikePost(postId) : existingPost;
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to unlike post" });
    }
  });

  // Update post route
  app.patch("/api/posts/:id", attachUser, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || content.trim() === "") {
        return res.status(400).json({ message: "Content cannot be empty" });
      }

      const ownership = await requirePostOwner(postId, req.dbUser!.id);
      if (!("post" in ownership)) {
        return res
          .status(ownership.status)
          .json({ message: ownership.message });
      }

      // Optional image URL update
      const imageUrl = req.body.imageUrl;

      const post = await storage.updatePost(postId, content, imageUrl);
      res.json(post);
    } catch (error) {
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  // Delete post route
  app.delete("/api/posts/:id", attachUser, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);

      const ownership = await requirePostOwner(postId, req.dbUser!.id);
      if (!("post" in ownership)) {
        return res
          .status(ownership.status)
          .json({ message: ownership.message });
      }

      // Delete post and related stories through the storage function
      await storage.deletePost(postId);

      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting post:`, error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // Save post route
  app.post("/api/posts/:id/save", attachUser, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const userId = req.dbUser!.id;

      await storage.savePost(userId, postId);
      res.status(200).json({ message: "Post saved successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to save post" });
    }
  });

  // Unsave post route
  app.post("/api/posts/:id/unsave", attachUser, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const userId = req.dbUser!.id;

      await storage.unsavePost(userId, postId);
      res.status(200).json({ message: "Post unsaved successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unsave post" });
    }
  });

  // Get saved posts for a user
  app.get("/api/users/:id/saved-posts", attachUser, async (req, res) => {
    try {
      // Verify user is requesting their own saved posts
      if (req.dbUser!.id !== parseInt(req.params.id)) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const userId = parseInt(req.params.id);
      const savedPosts = await storage.getSavedPosts(userId);
      res.json(savedPosts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch saved posts" });
    }
  });

  // Comment routes
  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByPostId(
        parseInt(req.params.postId),
      );
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Get total comment count for a post (including all replies)
  app.get("/api/posts/:postId/comment-count", async (req, res) => {
    try {
      const count = await storage.getTotalCommentCountForPost(
        parseInt(req.params.postId),
      );
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch comment count" });
    }
  });

  // Tagged users are projection data returned with the post. Going through the
  // storage boundary keeps the endpoint usable in standalone/demo mode too.
  app.get("/api/posts/:postId/tagged-users", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const post = await storage.getPostById(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post.taggedUsers ?? []);
    } catch (error) {
      console.error("Error getting tagged users:", error);
      res.status(500).json({ message: "Failed to get tagged users" });
    }
  });

  // Get post count for a user
  app.get("/api/users/:userId/post-count", async (req, res) => {
    try {
      const count = await storage.getPostCountByUser(
        parseInt(req.params.userId),
      );
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch post count" });
    }
  });

  // Get posts by user ID
  app.get("/api/users/:userId/posts", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const type = req.query.type as string | undefined;
      const posts = await storage.getPostsByUserId(userId);

      // Filter by type if specified
      if (type) {
        const filteredPosts = posts.filter((post) => {
          // If post has a specific mediaType, use that
          if (post.mediaType) {
            return post.mediaType === type;
          }

          // Legacy format fallback
          if (type === "photo" && post.imageUrl) return true;
          if (type === "audio" && post.audioUrl) return true;
          if (type === "video" && post.videoUrl) return true;
          if (
            type === "text" &&
            !post.imageUrl &&
            !post.audioUrl &&
            !post.videoUrl
          )
            return true;

          return false;
        });
        return res.json(filteredPosts);
      }

      res.json(posts);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ message: "Failed to fetch user posts" });
    }
  });

  app.post("/api/comments", attachUser, async (req, res) => {
    try {
      const parsed = insertCommentSchema.safeParse({
        ...req.body,
        userId: req.dbUser!.id,
      });
      if (!parsed.success) return res.status(400).json({ message: "Invalid comment", issues: parsed.error.issues });
      const result = await db.transaction(async (tx) => {
        const [post] = await tx.select().from(posts).where(eq(posts.id, parsed.data.postId)).limit(1);
        if (!post) return null;
        if (parsed.data.parentId != null) {
          const [parent] = await tx.select({ postId: comments.postId }).from(comments).where(eq(comments.id, parsed.data.parentId)).limit(1);
          if (!parent || parent.postId !== post.id) throw new Error("Comment reply does not belong to this post");
        }
        const [comment] = await tx.insert(comments).values(parsed.data).returning();
        await tx
          .update(posts)
          .set({ comments: sql`${posts.comments} + 1` })
          .where(eq(posts.id, post.id));
        if (post.userId !== req.dbUser!.id) {
          await tx.insert(automationTriggerEvents).values({
            ownerUserId: post.userId,
            eventType: NATIVE_COMMENT_CREATED_EVENT,
            idempotencyKey: `native:comment:${comment.id}:owner:${post.userId}`,
            payload: {
              channel: "native",
              automated: false,
              actorUserId: req.dbUser!.id,
              actorDisplayName: req.dbUser!.displayName,
              commentId: comment.id,
              postId: comment.postId,
              parentId: comment.parentId,
              content: comment.content,
            },
          }).onConflictDoNothing();
        }
        return { comment, post };
      });
      if (!result) return res.status(404).json({ message: "Post not found" });
      const { comment, post } = result;
      if (post) {
        await createActivityNotification({
          recipientId: post.userId,
          actorId: req.dbUser!.id,
          type: "comment",
          message: `${req.dbUser!.displayName} commented on your post`,
          linkTo: `/profile/${post.userId}`,
        });
      }
      res.status(201).json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  app.get("/api/comments/:commentId/replies", async (req, res) => {
    try {
      const replies = await storage.getCommentReplies(
        parseInt(req.params.commentId),
      );
      res.json(replies);
    } catch (error: any) {
      console.error("Error fetching comment replies:", error);
      res.status(500).json({
        message: "Failed to fetch comment replies",
        error: error.message,
      });
    }
  });

  // Get a single comment by ID
  app.get("/api/comments/:id", async (req, res) => {
    try {
      const comment = await storage.getCommentById(parseInt(req.params.id));
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      res.json(comment);
    } catch (error: any) {
      console.error("Error fetching comment:", error);
      res.status(500).json({ message: "Failed to fetch comment" });
    }
  });

  // Update a comment
  app.put("/api/comments/:id", attachUser, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const { content } = req.body;
      const userId = req.dbUser!.id;

      // Verify the comment belongs to the user before updating
      const comment = await storage.getCommentById(commentId);

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      if (comment.userId !== userId) {
        return res
          .status(403)
          .json({ message: "You can only edit your own comments" });
      }

      const updatedComment = await storage.updateComment(commentId, content);
      res.json(updatedComment);
    } catch (error: any) {
      console.error("Error updating comment:", error);
      res.status(500).json({ message: "Failed to update comment" });
    }
  });

  // Delete a comment
  app.delete("/api/comments/:id", attachUser, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const userId = req.dbUser!.id;

      // Verify the comment belongs to the user before deleting
      const comment = await storage.getCommentById(commentId);

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      if (comment.userId !== userId) {
        return res
          .status(403)
          .json({ message: "You can only delete your own comments" });
      }

      await storage.deleteComment(commentId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  app.post("/api/comments/:id/like", attachUser, async (req, res) => {
    try {
      // Get the comment ID from the URL parameter
      const commentId = parseInt(req.params.id);

      // Like the comment
      const comment = await storage.likeComment(commentId);

      // Get the updated comment with user details if it's a top-level comment
      if (comment.parentId === null) {
        const updatedComment = await storage.getCommentById(commentId);
        if (updatedComment) {
          return res.json(updatedComment);
        }
      }

      // Otherwise, return the comment as is
      res.json(comment);
    } catch (error: any) {
      console.error("Error liking comment:", error);
      res
        .status(500)
        .json({ message: "Failed to like comment", error: error.message });
    }
  });

  app.post("/api/comments/:id/unlike", attachUser, async (req, res) => {
    try {
      // Get the comment ID from the URL parameter
      const commentId = parseInt(req.params.id);

      // Unlike the comment
      const comment = await storage.unlikeComment(commentId);

      // Get the updated comment with user details if it's a top-level comment
      if (comment.parentId === null) {
        const updatedComment = await storage.getCommentById(commentId);
        if (updatedComment) {
          return res.json(updatedComment);
        }
      }

      // Otherwise, return the comment as is
      res.json(comment);
    } catch (error: any) {
      console.error("Error unliking comment:", error);
      res
        .status(500)
        .json({ message: "Failed to unlike comment", error: error.message });
    }
  });

  app.get("/api/search/discovery", async (_req, res) => {
    try {
      const [suggestedCreators, recentProductRows, trendingProductRows, topicRows] =
        await Promise.all([
          db
            .select(publicUserFields)
            .from(users)
            .orderBy(desc(users.createdAt))
            .limit(2),
          db
            .select({ product: products, user: publicUserFields })
            .from(products)
            .innerJoin(users, eq(products.userId, users.id))
            .where(eq(products.status, "published"))
            .orderBy(desc(products.createdAt))
            .limit(3),
          db
            .select({ product: products, user: publicUserFields })
            .from(products)
            .innerJoin(users, eq(products.userId, users.id))
            .where(eq(products.status, "published"))
            .orderBy(
              desc(products.rating),
              desc(products.reviewCount),
              desc(products.createdAt),
            )
            .limit(4),
          db
            .select({ content: posts.content })
            .from(posts)
            .orderBy(desc(posts.createdAt))
            .limit(500),
        ]);
      res.json({
        suggestedCreators,
        recentProducts: recentProductRows.map(({ product, user }) => ({
          ...product,
          user,
        })),
        trendingProducts: trendingProductRows.map(({ product, user }) => ({
          ...product,
          user,
        })),
        trendingTopics: rankPostTopics(topicRows.map((row) => row.content)),
      });
    } catch {
      res.status(500).json({ message: "Discovery is temporarily unavailable" });
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const query = normalizeSearchQuery(req.query.query);
      if (!query) return res.json({ users: [], products: [], posts: [] });
      const pattern = `%${query}%`;
      const [matchedUsers, matchedProducts, matchedPosts] = await Promise.all([
        db
          .select(publicUserFields)
          .from(users)
          .where(
            or(
              ilike(users.username, pattern),
              ilike(users.displayName, pattern),
              ilike(users.bio, pattern),
            ),
          )
          .orderBy(desc(users.createdAt))
          .limit(8),
        db
          .select({ product: products, user: publicUserFields })
          .from(products)
          .innerJoin(users, eq(products.userId, users.id))
          .where(
            and(
              eq(products.status, "published"),
              or(
                ilike(products.title, pattern),
                ilike(products.description, pattern),
                ilike(products.category, pattern),
                ilike(users.displayName, pattern),
                ilike(users.username, pattern),
              ),
            ),
          )
          .orderBy(desc(products.createdAt))
          .limit(8),
        db
          .select({ post: posts, user: publicUserFields })
          .from(posts)
          .innerJoin(users, eq(posts.userId, users.id))
          .where(
            or(
              ilike(posts.content, pattern),
              ilike(users.displayName, pattern),
              ilike(users.username, pattern),
            ),
          )
          .orderBy(desc(posts.createdAt))
          .limit(12),
      ]);
      res.json({
        users: matchedUsers,
        products: matchedProducts.map(({ product, user }) => ({
          ...product,
          user,
        })),
        posts: matchedPosts.map(({ post, user }) => ({ ...post, user })),
      });
    } catch {
      res.status(500).json({ message: "Search is temporarily unavailable" });
    }
  });

  app.get("/api/business/insights", attachUser, async (req, res) => {
    try {
      const [
        allocations,
        ownedProductCount,
        recentOffers,
        jobs,
        ownedCampaigns,
        followers,
        following,
      ] = await Promise.all([
        db
          .select()
          .from(creatorEarningsAllocations)
          .where(eq(creatorEarningsAllocations.sellerUserId, req.dbUser!.id)),
        db
          .select({ value: count() })
          .from(products)
          .where(eq(products.userId, req.dbUser!.id)),
        db
          .select({
            id: products.id,
            title: products.title,
            category: products.category,
            price: products.price,
            status: products.status,
          })
          .from(products)
          .where(eq(products.userId, req.dbUser!.id))
          .orderBy(desc(products.createdAt))
          .limit(4),
        db
          .select()
          .from(distributionJobs)
          .where(eq(distributionJobs.userId, req.dbUser!.id)),
        db
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(eq(campaigns.ownerUserId, req.dbUser!.id)),
        storage.getFollowerCount(req.dbUser!.id),
        storage.getFollowingCount(req.dbUser!.id),
      ]);
      const sumCents = (status?: string) =>
        allocations
          .filter((allocation) => !status || allocation.status === status)
          .reduce(
            (total, allocation) => total + allocation.creatorNetAmount,
            0,
          );
      const platformFeesCents = allocations.reduce(
        (total, allocation) => total + allocation.platformFeeAmount,
        0,
      );
      res.json({
        creatorEarningsCents: sumCents("paid"),
        pendingCreatorEarningsCents: sumCents("pending"),
        platformFeesCents,
        creatorSales: allocations.length,
        offers: Number(ownedProductCount[0]?.value ?? 0),
        recentOffers,
        followers,
        following,
        campaigns: ownedCampaigns.length,
        distribution: {
          published: jobs.filter((job) => job.status === "published").length,
          scheduled: jobs.filter((job) => job.status === "scheduled").length,
          needsConnection: jobs.filter(
            (job) => job.status === "needs_connection",
          ).length,
        },
      });
    } catch {
      res.status(500).json({ message: "Unable to load business insights" });
    }
  });

  // Product routes
  app.get("/api/marketplace/saved-products", attachUser, async (req, res) => {
    try {
      const rows = await db
        .select({ product: products, user: publicUserFields })
        .from(productSaves)
        .innerJoin(products, eq(productSaves.productId, products.id))
        .innerJoin(users, eq(products.userId, users.id))
        .where(eq(productSaves.userId, req.dbUser!.id))
        .orderBy(desc(productSaves.createdAt));
      res.json(rows.map(({ product, user }) => ({ ...product, user })));
    } catch {
      res.status(500).json({ message: "Failed to load saved offers" });
    }
  });

  app.put(
    "/api/marketplace/products/:id/save",
    attachUser,
    async (req, res) => {
      try {
        const productId = Number(req.params.id);
        if (!Number.isInteger(productId) || productId < 1)
          return res.status(400).json({ message: "Invalid product" });
        const [product] = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);
        if (!product)
          return res.status(404).json({ message: "Offer not found" });
        await db
          .insert(productSaves)
          .values({ userId: req.dbUser!.id, productId })
          .onConflictDoNothing();
        res.status(204).end();
      } catch {
        res.status(500).json({ message: "Failed to save offer" });
      }
    },
  );

  app.delete(
    "/api/marketplace/products/:id/save",
    attachUser,
    async (req, res) => {
      try {
        const productId = Number(req.params.id);
        if (!Number.isInteger(productId) || productId < 1)
          return res.status(400).json({ message: "Invalid product" });
        await db
          .delete(productSaves)
          .where(
            and(
              eq(productSaves.userId, req.dbUser!.id),
              eq(productSaves.productId, productId),
            ),
          );
        res.status(204).end();
      } catch {
        res.status(500).json({ message: "Failed to remove saved offer" });
      }
    },
  );

  app.get("/api/marketplace/products", async (req, res) => {
    try {
      const query = parseMarketplaceQuery(req.query);
      const clauses: SQL[] = [eq(products.status, "published")];
      if (query.search) {
        const pattern = `%${query.search}%`;
        clauses.push(
          or(
            ilike(products.title, pattern),
            ilike(products.description, pattern),
            ilike(products.category, pattern),
            ilike(users.displayName, pattern),
            ilike(users.username, pattern),
          )!,
        );
      }
      if (query.category === "courses")
        clauses.push(eq(products.productType, "course"));
      if (query.category === "communities")
        clauses.push(inArray(products.productType, ["community", "membership"]));
      if (query.category === "digital_assets")
        clauses.push(eq(products.productType, "digital_download"));
      const whereClause = clauses.length ? and(...clauses) : undefined;
      const order =
        query.sort === "price_low"
          ? asc(products.price)
          : query.sort === "price_high"
            ? desc(products.price)
            : query.sort === "top_rated"
              ? desc(products.rating)
              : desc(products.createdAt);
      const [rows, totals] = await Promise.all([
        db
          .select({ product: products, user: publicUserFields })
          .from(products)
          .innerJoin(users, eq(products.userId, users.id))
          .where(whereClause)
          .orderBy(order)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db
          .select({ total: count() })
          .from(products)
          .innerJoin(users, eq(products.userId, users.id))
          .where(whereClause),
      ]);
      res.json({
        items: rows.map(({ product, user }) => ({ ...product, user })),
        page: query.page,
        pageSize: query.pageSize,
        total: Number(totals[0]?.total ?? 0),
      });
    } catch {
      res
        .status(500)
        .json({ message: "Failed to discover marketplace offers" });
    }
  });

  app.get("/api/products", async (req, res) => {
    try {
      const requestedCategory =
        typeof req.query.category === "string" ? req.query.category : null;
      const rows = await db
        .select({ product: products, user: publicUserFields })
        .from(products)
        .innerJoin(users, eq(products.userId, users.id))
        .where(
          requestedCategory
            ? and(
                eq(products.status, "published"),
                eq(products.category, requestedCategory),
              )
            : eq(products.status, "published"),
        )
        .orderBy(desc(products.createdAt));
      res.json(rows.map(({ product, user }) => ({ ...product, user })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id/manage", attachUser, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const product = Number.isInteger(productId)
        ? await storage.getProductById(productId)
        : undefined;
      if (!product || product.userId !== req.dbUser!.id)
        return res.status(404).json({ message: "Offer not found" });
      res.json(product);
    } catch {
      res.status(500).json({ message: "Failed to fetch offer" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId < 1) {
        return res.status(404).json({ message: "Product not found" });
      }
      const [row] = await db
        .select({ product: products, user: publicUserFields })
        .from(products)
        .innerJoin(users, eq(products.userId, users.id))
        .where(
          and(
            eq(products.id, productId),
            eq(products.status, "published"),
          ),
        )
        .limit(1);
      if (!row) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ ...row.product, user: row.user });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.get("/api/products/:id/reviews", async (req, res) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId < 1)
        return res.status(400).json({ message: "Invalid product" });
      const reviews = await db
        .select({
          id: productReviews.id,
          rating: productReviews.rating,
          body: productReviews.body,
          isVerifiedPurchase: productReviews.isVerifiedPurchase,
          createdAt: productReviews.createdAt,
          updatedAt: productReviews.updatedAt,
          author: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profileImageUrl: users.profileImageUrl,
          },
        })
        .from(productReviews)
        .innerJoin(users, eq(productReviews.userId, users.id))
        .where(eq(productReviews.productId, productId))
        .orderBy(desc(productReviews.updatedAt));
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  app.put("/api/products/:id/review", attachUser, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const rating = Number(req.body?.rating);
      const body =
        typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (
        !Number.isInteger(productId) ||
        productId < 1 ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        body.length > 2_000
      ) {
        return res.status(400).json({
          message:
            "A rating from 1 to 5 and a review under 2,000 characters are required",
        });
      }
      const product = await storage.getProductById(productId);
      if (!product)
        return res.status(404).json({ message: "Product not found" });
      if (product.userId === req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You cannot review your own offer" });

      const [entitlement] = await db
        .select({ id: entitlements.id })
        .from(entitlements)
        .where(
          and(
            eq(entitlements.userId, req.dbUser!.id),
            eq(entitlements.productId, productId),
            eq(entitlements.status, "active"),
          ),
        )
        .limit(1);
      if (!entitlement)
        return res
          .status(403)
          .json({ message: "Only verified purchasers can review this offer" });

      const review = await db.transaction(async (tx) => {
        const [saved] = await tx
          .insert(productReviews)
          .values({
            productId,
            userId: req.dbUser!.id,
            rating,
            body,
            isVerifiedPurchase: true,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [productReviews.userId, productReviews.productId],
            set: {
              rating,
              body,
              isVerifiedPurchase: true,
              updatedAt: new Date(),
            },
          })
          .returning();
        const [aggregate] = await tx
          .select({
            rating: sql<number>`coalesce(avg(${productReviews.rating}), 0)`,
            reviewCount: count(productReviews.id),
          })
          .from(productReviews)
          .where(eq(productReviews.productId, productId));
        await tx
          .update(products)
          .set({
            rating: Number(aggregate.rating),
            reviewCount: Number(aggregate.reviewCount),
          })
          .where(eq(products.id, productId));
        return saved;
      });
      res.json(review);
    } catch (error) {
      res.status(500).json({ message: "Failed to save review" });
    }
  });

  app.post("/api/posts/:postId/view", attachUser, async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      const post = await storage.getPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });
      if (process.env.CREATOROS_DEMO_MODE !== "true") {
        await db
          .insert(postViews)
          .values({ postId, userId: req.dbUser!.id })
          .onConflictDoNothing();
      }
      res.status(204).end();
    } catch {
      res.status(500).json({ message: "Failed to record post view" });
    }
  });

  app.get("/api/posts/:postId/analytics", attachUser, async (req, res) => {
    try {
      const postId = Number(req.params.postId);
      const post = await storage.getPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });
      if (post.userId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "Only the creator can view post analytics" });
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res.json({
          views: 0,
          likes: post.likes,
          comments: post.comments,
          saves: 0,
          reposts: 0,
          interactions: post.likes + post.comments,
        });
      }
      const [views, saves, commentCount, reposts] = await Promise.all([
        db
          .select({ value: count() })
          .from(postViews)
          .where(eq(postViews.postId, postId)),
        db
          .select({ value: count() })
          .from(savedPosts)
          .where(eq(savedPosts.postId, postId)),
        db
          .select({ value: count() })
          .from(comments)
          .where(eq(comments.postId, postId)),
        db
          .select({ value: count() })
          .from(posts)
          .where(eq(posts.repostOfId, postId)),
      ]);
      const metrics = {
        views: views[0].value,
        likes: post.likes,
        comments: commentCount[0].value,
        saves: saves[0].value,
        reposts: reposts[0].value,
      };
      res.json({
        ...metrics,
        interactions:
          metrics.likes + metrics.comments + metrics.saves + metrics.reposts,
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch post analytics" });
    }
  });

  app.get("/api/users/:id/liked-posts", attachUser, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (req.dbUser!.id !== userId)
        return res.status(403).json({ message: "Not authorized" });
      res.json(await storage.getLikedPosts(userId));
    } catch {
      res.status(500).json({ message: "Failed to fetch liked posts" });
    }
  });

  app.get("/api/playlists", attachUser, async (req, res) => {
    const rows = await db
      .select()
      .from(playlists)
      .where(eq(playlists.userId, req.dbUser!.id))
      .orderBy(desc(playlists.createdAt));
    const ids = rows.map((playlist) => playlist.id);
    const entries = ids.length
      ? await db
          .select()
          .from(playlistPosts)
          .where(inArray(playlistPosts.playlistId, ids))
      : [];
    res.json(
      rows.map((playlist) => ({
        ...playlist,
        postIds: entries
          .filter((entry) => entry.playlistId === playlist.id)
          .map((entry) => entry.postId),
      })),
    );
  });

  app.post("/api/playlists", attachUser, async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name)
      return res.status(400).json({ message: "Playlist name is required" });
    const [playlist] = await db
      .insert(playlists)
      .values({
        userId: req.dbUser!.id,
        name,
        description:
          typeof req.body.description === "string"
            ? req.body.description.trim()
            : "",
      })
      .returning();
    const postIds = Array.isArray(req.body.postIds)
      ? (Array.from(
          new Set(
            req.body.postIds.filter((id: unknown) => Number.isInteger(id)),
          ),
        ) as number[])
      : [];
    if (postIds.length)
      await db
        .insert(playlistPosts)
        .values(postIds.map((postId) => ({ playlistId: playlist.id, postId })))
        .onConflictDoNothing();
    res.status(201).json({ ...playlist, postIds });
  });

  app.delete("/api/playlists/:id", attachUser, async (req, res) => {
    const deleted = await db
      .delete(playlists)
      .where(
        and(
          eq(playlists.id, req.params.id),
          eq(playlists.userId, req.dbUser!.id),
        ),
      )
      .returning({ id: playlists.id });
    if (!deleted.length)
      return res.status(404).json({ message: "Playlist not found" });
    res.status(204).send();
  });

  app.get("/api/courses/:productId/progress", attachUser, async (req, res) => {
    const productId = parseInt(req.params.productId);
    const access = await requireCourseAccess(productId, req.dbUser!.id);
    if (!("product" in access))
      return res.status(access.status).json({ message: access.message });
    const progress = await db
      .select()
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.userId, req.dbUser!.id),
          eq(courseProgress.productId, productId),
        ),
      );
    res.json(progress);
  });

  app.post("/api/courses/:productId/progress", attachUser, async (req, res) => {
    const productId = parseInt(req.params.productId);
    const access = await requireCourseAccess(productId, req.dbUser!.id);
    if (!("product" in access))
      return res.status(access.status).json({ message: access.message });
    const enrollmentStartsAt = access.enrollmentStartsAt ?? new Date();
    const lessonId =
      typeof req.body.lessonId === "string" ? req.body.lessonId : "";
    if (!lessonId)
      return res.status(400).json({ message: "Lesson is required" });
    const [lesson] = await db
      .select()
      .from(courseLessons)
      .innerJoin(courseModules, eq(courseLessons.moduleId, courseModules.id))
      .where(
        and(
          eq(courseLessons.id, lessonId),
          eq(courseModules.productId, productId),
        ),
      )
      .limit(1);
    if (!lesson || (!access.isOwner && !lesson.course_lessons.isPublished))
      return res.status(404).json({ message: "Course lesson not found" });
    if (
      !access.isOwner &&
      !isCourseLessonUnlocked(
        enrollmentStartsAt,
        lesson.course_lessons.availableAfterDays,
      )
    )
      return res
        .status(403)
        .json({ message: "This lesson has not unlocked yet" });
    const [record] = await db
      .insert(courseProgress)
      .values({ userId: req.dbUser!.id, productId, lessonId })
      .onConflictDoNothing()
      .returning();
    res.status(record ? 201 : 200).json(record ?? { productId, lessonId });
  });

  app.get(
    "/api/courses/:productId/curriculum",
    attachUser,
    async (req, res) => {
      try {
        const productId = parseInt(req.params.productId);
        const access = await requireCourseAccess(productId, req.dbUser!.id);
        if (!("product" in access))
          return res.status(access.status).json({ message: access.message });
        const enrollmentStartsAt = access.enrollmentStartsAt ?? new Date();
        const modules = await db
          .select()
          .from(courseModules)
          .where(eq(courseModules.productId, productId))
          .orderBy(courseModules.sortOrder, courseModules.createdAt);
        const ids = modules.map((module) => module.id);
        const lessons = ids.length
          ? await db
              .select()
              .from(courseLessons)
              .where(inArray(courseLessons.moduleId, ids))
              .orderBy(courseLessons.sortOrder, courseLessons.createdAt)
          : [];
        const lessonIds = lessons.map((lesson) => lesson.id);
        const assessments = lessonIds.length
          ? await db
              .select()
              .from(courseAssessments)
              .where(inArray(courseAssessments.lessonId, lessonIds))
          : [];
        const assessmentByLessonId = new Map(
          assessments.map((assessment) => [assessment.lessonId, assessment]),
        );
        const now = Date.now();
        const visibleLesson = (lesson: (typeof lessons)[number]) => {
          const unlockAt = courseLessonUnlockAt(
            enrollmentStartsAt,
            lesson.availableAfterDays,
          );
          const locked = !access.isOwner && unlockAt.getTime() > now;
          const assessment = assessmentByLessonId.get(lesson.id);
          return {
            ...lesson,
            locked,
            unlockAt: locked ? unlockAt.toISOString() : null,
            body: locked ? "" : lesson.body,
            videoUrl: locked ? null : lesson.videoUrl,
            resourceUrls: locked ? [] : lesson.resourceUrls,
            assessment: assessment
              ? {
                  id: assessment.id,
                  passingScorePercent: assessment.passingScorePercent,
                  questions: access.isOwner
                    ? assessment.questions
                    : locked
                      ? []
                      : learnerAssessmentQuestions(assessment.questions),
                }
              : null,
          };
        };
        res.json({
          product: access.product,
          modules: modules.map((module) => ({
            ...module,
            lessons: lessons
              .filter(
                (lesson) =>
                  lesson.moduleId === module.id &&
                  (access.isOwner || lesson.isPublished),
              )
              .map(visibleLesson),
          })),
        });
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch course curriculum" });
      }
    },
  );

  app.put("/api/courses/:productId/community", attachUser, async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      const access = await requireCourseAccess(productId, req.dbUser!.id);
      if (!("product" in access))
        return res.status(access.status).json({ message: access.message });
      if (!access.isOwner)
        return res
          .status(403)
          .json({ message: "Only the course creator can link a community" });
      const requestedCommunityId = req.body?.communityId;
      const communityId =
        requestedCommunityId === null || requestedCommunityId === ""
          ? null
          : Number(requestedCommunityId);
      if (communityId !== null) {
        if (
          !Number.isInteger(communityId) ||
          !(await storage.getCommunityById(communityId))
        )
          return res.status(404).json({ message: "Community not found" });
        const membership = await storage.getCommunityMembership(
          req.dbUser!.id,
          communityId,
        );
        if (!membership || membership.role !== "owner")
          return res
            .status(403)
            .json({ message: "You can only link a community you own" });
      }

      const [product] = await db
        .update(products)
        .set({ communityId })
        .where(eq(products.id, productId))
        .returning();
      let enrolledMembers = 0;
      if (communityId !== null) {
        const entitlementRows = await db
          .select({ userId: entitlements.userId })
          .from(entitlements)
          .where(
            and(
              eq(entitlements.productId, productId),
              eq(entitlements.status, "active"),
            ),
          );
        const userIds = Array.from(
          new Set(entitlementRows.map((row) => row.userId)),
        );
        if (userIds.length) {
          const joined = await db
            .insert(communityMemberships)
            .values(
              userIds.map((userId) => ({
                userId,
                communityId,
                role: "member",
              })),
            )
            .onConflictDoNothing()
            .returning({ id: communityMemberships.id });
          enrolledMembers = joined.length;
        }
      }
      void emitProjectionEvent({
        aggregateType: "course",
        aggregateId: String(productId),
        eventType: "course.community_linked",
        actorUserId: req.dbUser!.id,
        payload: { communityId, enrolledMembers },
        idempotencyKey: `course.community_linked:${productId}:${communityId ?? "none"}`,
      }).catch((error) =>
        console.error("Failed to enqueue course community projection:", error),
      );
      res.json({ product, communityId, enrolledMembers });
    } catch (error) {
      console.error("Could not update course community access:", error);
      res
        .status(500)
        .json({ message: "Could not update course community access" });
    }
  });

  app.post("/api/courses/:productId/modules", attachUser, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const access = await requireCourseAccess(productId, req.dbUser!.id);
      if (!("product" in access))
        return res.status(access.status).json({ message: access.message });
      if (!access.isOwner)
        return res
          .status(403)
          .json({ message: "Only the course creator can edit curriculum" });
      const title =
        typeof req.body?.title === "string" ? req.body.title.trim() : "";
      if (!title || title.length > 160)
        return res.status(400).json({ message: "Module title is required" });
      const [{ value: maxOrder = -1 } = { value: -1 }] = await db
        .select({
          value: sql<number>`coalesce(max(${courseModules.sortOrder}), -1)`,
        })
        .from(courseModules)
        .where(eq(courseModules.productId, productId));
      const [module] = await db
        .insert(courseModules)
        .values({
          productId,
          title,
          description:
            typeof req.body?.description === "string"
              ? req.body.description.trim().slice(0, 5000)
              : "",
          sortOrder: maxOrder + 1,
        })
        .returning();
      res.status(201).json(module);
    } catch (error) {
      res.status(500).json({ message: "Failed to create course module" });
    }
  });

  app.post(
    "/api/courses/:productId/modules/:moduleId/lessons",
    attachUser,
    async (req, res) => {
      try {
        const productId = parseInt(req.params.productId);
        const access = await requireCourseAccess(productId, req.dbUser!.id);
        if (!("product" in access))
          return res.status(access.status).json({ message: access.message });
        if (!access.isOwner)
          return res
            .status(403)
            .json({ message: "Only the course creator can edit curriculum" });
        const [module] = await db
          .select()
          .from(courseModules)
          .where(
            and(
              eq(courseModules.id, req.params.moduleId),
              eq(courseModules.productId, productId),
            ),
          )
          .limit(1);
        if (!module)
          return res.status(404).json({ message: "Course module not found" });
        const title =
          typeof req.body?.title === "string" ? req.body.title.trim() : "";
        const body =
          typeof req.body?.body === "string" ? req.body.body.trim() : "";
        if (!title || title.length > 240 || body.length > 50_000)
          return res.status(400).json({ message: "Invalid lesson details" });
        const [{ value: maxOrder = -1 } = { value: -1 }] = await db
          .select({
            value: sql<number>`coalesce(max(${courseLessons.sortOrder}), -1)`,
          })
          .from(courseLessons)
          .where(eq(courseLessons.moduleId, module.id));
        const resourceUrls = Array.isArray(req.body?.resourceUrls)
          ? req.body.resourceUrls
              .filter(
                (url: unknown) => typeof url === "string" && url.length <= 2000,
              )
              .slice(0, 20)
          : [];
        const durationSeconds =
          Number.isInteger(req.body?.durationSeconds) &&
          req.body.durationSeconds >= 0 &&
          req.body.durationSeconds <= 86_400
            ? req.body.durationSeconds
            : 0;
        const availableAfterDays =
          Number.isInteger(req.body?.availableAfterDays) &&
          req.body.availableAfterDays >= 0 &&
          req.body.availableAfterDays <= 3650
            ? req.body.availableAfterDays
            : 0;
        const [lesson] = await db
          .insert(courseLessons)
          .values({
            moduleId: module.id,
            title,
            body,
            videoUrl:
              typeof req.body?.videoUrl === "string"
                ? req.body.videoUrl.slice(0, 2000)
                : null,
            resourceUrls,
            durationSeconds,
            availableAfterDays,
            sortOrder: maxOrder + 1,
            isPublished: Boolean(req.body?.isPublished),
          })
          .returning();
        res.status(201).json(lesson);
      } catch (error) {
        res.status(500).json({ message: "Failed to create course lesson" });
      }
    },
  );

  app.patch(
    "/api/courses/:productId/lessons/:lessonId",
    attachUser,
    async (req, res) => {
      try {
        const productId = parseInt(req.params.productId);
        const access = await requireCourseAccess(productId, req.dbUser!.id);
        if (!("product" in access))
          return res.status(access.status).json({ message: access.message });
        if (!access.isOwner)
          return res
            .status(403)
            .json({ message: "Only the course creator can edit curriculum" });
        const [lesson] = await db
          .select()
          .from(courseLessons)
          .innerJoin(
            courseModules,
            eq(courseLessons.moduleId, courseModules.id),
          )
          .where(
            and(
              eq(courseLessons.id, req.params.lessonId),
              eq(courseModules.productId, productId),
            ),
          )
          .limit(1);
        if (!lesson)
          return res.status(404).json({ message: "Course lesson not found" });
        const isPublished =
          typeof req.body?.isPublished === "boolean"
            ? req.body.isPublished
            : lesson.course_lessons.isPublished;
        const availableAfterDays =
          Number.isInteger(req.body?.availableAfterDays) &&
          req.body.availableAfterDays >= 0 &&
          req.body.availableAfterDays <= 3650
            ? req.body.availableAfterDays
            : lesson.course_lessons.availableAfterDays;
        const [updated] = await db
          .update(courseLessons)
          .set({ isPublished, availableAfterDays, updatedAt: new Date() })
          .where(eq(courseLessons.id, lesson.course_lessons.id))
          .returning();
        res.json(updated);
      } catch (error) {
        res.status(500).json({ message: "Failed to update course lesson" });
      }
    },
  );

  app.put(
    "/api/courses/:productId/lessons/:lessonId/assessment",
    attachUser,
    async (req, res) => {
      try {
        const productId = parseInt(req.params.productId);
        const access = await requireCourseAccess(productId, req.dbUser!.id);
        if (!("product" in access))
          return res.status(access.status).json({ message: access.message });
        if (!access.isOwner)
          return res
            .status(403)
            .json({ message: "Only the course creator can edit assessments" });
        const [lesson] = await db
          .select({ id: courseLessons.id })
          .from(courseLessons)
          .innerJoin(
            courseModules,
            eq(courseLessons.moduleId, courseModules.id),
          )
          .where(
            and(
              eq(courseLessons.id, req.params.lessonId),
              eq(courseModules.productId, productId),
            ),
          )
          .limit(1);
        if (!lesson)
          return res.status(404).json({ message: "Course lesson not found" });
        const passingScorePercent =
          Number.isInteger(req.body?.passingScorePercent) &&
          req.body.passingScorePercent >= 0 &&
          req.body.passingScorePercent <= 100
            ? req.body.passingScorePercent
            : 70;
        const incoming = Array.isArray(req.body?.questions)
          ? req.body.questions
          : [];
        if (!incoming.length || incoming.length > 25)
          return res
            .status(400)
            .json({ message: "Add between 1 and 25 questions" });
        const questions = incoming.map((question: unknown, index: number) => {
          const item = question as {
            prompt?: unknown;
            choices?: unknown;
            answerIndex?: unknown;
          };
          const prompt =
            typeof item.prompt === "string" ? item.prompt.trim() : "";
          const choices = Array.isArray(item.choices)
            ? item.choices
                .filter(
                  (choice): choice is string => typeof choice === "string",
                )
                .map((choice) => choice.trim())
                .filter(Boolean)
                .slice(0, 8)
            : [];
          const answerIndex =
            typeof item.answerIndex === "number" &&
            Number.isInteger(item.answerIndex)
              ? item.answerIndex
              : -1;
          if (
            !prompt ||
            prompt.length > 1000 ||
            choices.length < 2 ||
            answerIndex < 0 ||
            answerIndex >= choices.length
          )
            throw new Error(`Invalid question ${index + 1}`);
          return { id: crypto.randomUUID(), prompt, choices, answerIndex };
        });
        const [assessment] = await db
          .insert(courseAssessments)
          .values({ lessonId: lesson.id, passingScorePercent, questions })
          .onConflictDoUpdate({
            target: courseAssessments.lessonId,
            set: { passingScorePercent, questions, updatedAt: new Date() },
          })
          .returning();
        res.json(assessment);
      } catch (error) {
        res.status(400).json({
          message:
            error instanceof Error &&
            error.message.startsWith("Invalid question")
              ? error.message
              : "Could not save assessment",
        });
      }
    },
  );

  app.post(
    "/api/courses/:productId/lessons/:lessonId/assessment/attempts",
    attachUser,
    async (req, res) => {
      try {
        const productId = parseInt(req.params.productId);
        const access = await requireCourseAccess(productId, req.dbUser!.id);
        if (!("product" in access))
          return res.status(access.status).json({ message: access.message });
        const enrollmentStartsAt = access.enrollmentStartsAt ?? new Date();
        const [lesson] = await db
          .select()
          .from(courseLessons)
          .innerJoin(
            courseModules,
            eq(courseLessons.moduleId, courseModules.id),
          )
          .where(
            and(
              eq(courseLessons.id, req.params.lessonId),
              eq(courseModules.productId, productId),
            ),
          )
          .limit(1);
        if (!lesson || (!access.isOwner && !lesson.course_lessons.isPublished))
          return res.status(404).json({ message: "Course lesson not found" });
        if (
          !access.isOwner &&
          !isCourseLessonUnlocked(
            enrollmentStartsAt,
            lesson.course_lessons.availableAfterDays,
          )
        )
          return res
            .status(403)
            .json({ message: "This lesson has not unlocked yet" });
        const [assessment] = await db
          .select()
          .from(courseAssessments)
          .where(eq(courseAssessments.lessonId, lesson.course_lessons.id))
          .limit(1);
        if (!assessment)
          return res.status(404).json({ message: "Assessment not found" });
        const rawAnswers =
          req.body?.answers &&
          typeof req.body.answers === "object" &&
          !Array.isArray(req.body.answers)
            ? (req.body.answers as Record<string, unknown>)
            : {};
        const { answers, scorePercent, passed } = scoreCourseAssessment(
          assessment.questions,
          rawAnswers,
          assessment.passingScorePercent,
        );
        const [attempt] = await db
          .insert(courseAssessmentAttempts)
          .values({
            assessmentId: assessment.id,
            userId: req.dbUser!.id,
            scorePercent,
            passed,
            answers,
          })
          .returning();
        res.status(201).json({
          id: attempt.id,
          scorePercent,
          passed,
          passingScorePercent: assessment.passingScorePercent,
        });
      } catch {
        res.status(500).json({ message: "Could not submit assessment" });
      }
    },
  );

  app.get("/api/events", attachUser, async (req, res) => {
    res.json(
      await db
        .select()
        .from(events)
        .where(eq(events.userId, req.dbUser!.id))
        .orderBy(desc(events.dateTime)),
    );
  });

  app.get("/api/communities/:id/events", attachUser, async (req, res) => {
    try {
      const communityId = Number(req.params.id);
      if (
        !Number.isInteger(communityId) ||
        !(await storage.getCommunityById(communityId))
      )
        return res.status(404).json({ message: "Community not found" });
      const [membership] = await db
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.userId, req.dbUser!.id),
            ne(communityMemberships.status, "banned"),
          ),
        )
        .limit(1);
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community to view its events" });
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.communityId, communityId))
        .orderBy(events.dateTime);
      if (!rows.length) return res.json([]);
      const ids = rows.map((event) => event.id);
      const [attendanceRows, countRows] = await Promise.all([
        db
          .select({ eventId: eventAttendees.eventId, status: eventAttendees.status })
          .from(eventAttendees)
          .where(and(inArray(eventAttendees.eventId, ids), eq(eventAttendees.userId, req.dbUser!.id))),
        db
          .select({ eventId: eventAttendees.eventId, value: count() })
          .from(eventAttendees)
          .where(and(inArray(eventAttendees.eventId, ids), eq(eventAttendees.status, "going")))
          .groupBy(eventAttendees.eventId),
      ]);
      const attendanceByEvent = new Map(attendanceRows.map((row) => [row.eventId, row.status]));
      const goingByEvent = new Map(countRows.map((row) => [row.eventId, Number(row.value)]));
      res.json(rows.map((event) => ({
        ...event,
        attendanceStatus: attendanceByEvent.get(event.id) ?? null,
        goingCount: goingByEvent.get(event.id) ?? 0,
      })));
    } catch {
      res.status(500).json({ message: "Failed to fetch community events" });
    }
  });

  app.post("/api/events", attachUser, async (req, res) => {
    const {
      name,
      dateTime,
      communityId,
      channelId,
      location,
      description,
      coverUrl,
    } = req.body;
    const eventName = typeof name === "string" ? name.trim() : "";
    const parsedDateTime = typeof dateTime === "string" ? new Date(dateTime) : new Date(Number.NaN);
    const eventDescription = typeof description === "string" ? description.trim() : "";
    const eventLocation = typeof location === "string" && location.trim() ? location.trim() : null;
    const parsedCoverUrl = typeof coverUrl === "string" && coverUrl.trim() ? parseRoomUrl(coverUrl.trim()) : null;
    if (!eventName || eventName.length > 160 || Number.isNaN(parsedDateTime.valueOf()) || !communityId || !channelId)
      return res
        .status(400)
        .json({ message: "A valid name, time, community, and channel are required" });
    if (eventDescription.length > 10_000 || (eventLocation?.length ?? 0) > 500 || parsedCoverUrl === undefined)
      return res.status(400).json({ message: "Event details are invalid" });
    const parsedCommunityId = Number(communityId);
    if (
      !Number.isInteger(parsedCommunityId) ||
      !(await storage.getCommunityById(parsedCommunityId))
    )
      return res.status(404).json({ message: "Community not found" });
    const membership = await storage.getCommunityMembership(
      req.dbUser!.id,
      parsedCommunityId,
    );
    if (!membership || !["owner", "admin"].includes(membership.role))
      return res
        .status(403)
        .json({ message: "Only community managers can create events" });
    if (!canContributeToCommunity(membership.status))
      return res
        .status(403)
        .json({ message: "Your community access is currently read-only" });
    const parsedChannelId = Number(channelId);
    const [channel] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.id, parsedChannelId), eq(channels.communityId, parsedCommunityId)))
      .limit(1);
    if (!channel)
      return res.status(400).json({ message: "The selected channel is not in this community" });
    const event = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(events)
        .values({
          userId: req.dbUser!.id,
          name: eventName,
          dateTime: parsedDateTime,
          communityId: parsedCommunityId,
          channelId: parsedChannelId,
          location: eventLocation,
          description: eventDescription,
          coverUrl: parsedCoverUrl,
        })
        .returning();
      const schedule = parsedDateTime.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
      await tx.insert(channelMessages).values({
        channelId: parsedChannelId,
        userId: req.dbUser!.id,
        parentMessageId: null,
        content: `📅 ${eventName}\n${schedule} UTC${eventLocation ? ` · ${eventLocation}` : ""}${eventDescription ? `\n${eventDescription}` : ""}`,
        isPinned: true,
      });
      return created;
    });
    void emitProjectionEvent({
      aggregateType: "event",
      aggregateId: event.id,
      eventType: "event.created",
      actorUserId: req.dbUser!.id,
      payload: { communityId: event.communityId },
      idempotencyKey: `event.created:${event.id}`,
    }).catch((error) =>
      console.error("Failed to enqueue event projection:", error),
    );
    res.status(201).json(event);
  });

  app.get("/api/events/:id", attachUser, async (req, res) => {
    try {
      const parsedEventId = z.string().uuid().safeParse(req.params.id);
      if (!parsedEventId.success)
        return res.status(404).json({ message: "Event not found" });
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, parsedEventId.data))
        .limit(1);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const [membership] = await db
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, event.communityId),
            eq(communityMemberships.userId, req.dbUser!.id),
            ne(communityMemberships.status, "banned"),
          ),
        )
        .limit(1);
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community to view its event" });
      const [countRow] = await db
        .select({ value: count() })
        .from(eventAttendees)
        .where(
          and(
            eq(eventAttendees.eventId, event.id),
            eq(eventAttendees.status, "going"),
          ),
        );
      const [attendance] = await db
        .select()
        .from(eventAttendees)
        .where(
          and(
            eq(eventAttendees.eventId, event.id),
            eq(eventAttendees.userId, req.dbUser!.id),
          ),
        )
        .limit(1);
      res.json({
        ...event,
        attendeeCount: countRow.value,
        attendanceStatus: attendance?.status ?? null,
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  app.patch("/api/events/:id", attachUser, async (req, res) => {
    try {
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, req.params.id))
        .limit(1);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        event.communityId,
      );
      const canManage = Boolean(
        membership && ["owner", "admin"].includes(membership.role),
      );
      if (!canManage)
        return res
          .status(403)
          .json({ message: "Only community managers can edit this event" });
      if (membership && !canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });

      const eventName =
        typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const parsedDateTime =
        typeof req.body?.dateTime === "string"
          ? new Date(req.body.dateTime)
          : new Date(Number.NaN);
      const eventDescription =
        typeof req.body?.description === "string"
          ? req.body.description.trim()
          : "";
      const eventLocation =
        typeof req.body?.location === "string" && req.body.location.trim()
          ? req.body.location.trim()
          : null;
      const parsedCoverUrl =
        typeof req.body?.coverUrl === "string" && req.body.coverUrl.trim()
          ? parseRoomUrl(req.body.coverUrl.trim())
          : req.body?.coverUrl === null
            ? null
            : event.coverUrl;
      const parsedChannelId = Number(req.body?.channelId);

      if (
        !eventName ||
        eventName.length > 160 ||
        Number.isNaN(parsedDateTime.valueOf()) ||
        !Number.isInteger(parsedChannelId)
      )
        return res.status(400).json({ message: "Valid event details are required" });
      if (
        eventDescription.length > 10_000 ||
        (eventLocation?.length ?? 0) > 500 ||
        parsedCoverUrl === undefined
      )
        return res.status(400).json({ message: "Event details are invalid" });

      const [channel] = await db
        .select()
        .from(channels)
        .where(
          and(
            eq(channels.id, parsedChannelId),
            eq(channels.communityId, event.communityId),
          ),
        )
        .limit(1);
      if (!channel)
        return res
          .status(400)
          .json({ message: "The selected channel is not in this community" });

      const updated = await db.transaction(async (tx) => {
        const [saved] = await tx
          .update(events)
          .set({
            name: eventName,
            dateTime: parsedDateTime,
            channelId: parsedChannelId,
            location: eventLocation,
            description: eventDescription,
            coverUrl: parsedCoverUrl,
          })
          .where(eq(events.id, event.id))
          .returning();
        const schedule = parsedDateTime.toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        });
        await tx.insert(channelMessages).values({
          channelId: parsedChannelId,
          userId: req.dbUser!.id,
          parentMessageId: null,
          content: `Event updated: ${eventName}\n${schedule} UTC${eventLocation ? ` · ${eventLocation}` : ""}${eventDescription ? `\n${eventDescription}` : ""}`,
          isPinned: true,
        });
        return saved;
      });

      void emitProjectionEvent({
        aggregateType: "event",
        aggregateId: updated.id,
        eventType: "event.updated",
        actorUserId: req.dbUser!.id,
        payload: { communityId: updated.communityId },
        idempotencyKey: `event.updated:${updated.id}:${updated.dateTime.toISOString()}`,
      }).catch((error) =>
        console.error("Failed to enqueue event update projection:", error),
      );
      res.json(updated);
    } catch (error) {
      console.error("Failed to update event:", error);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.put("/api/events/:id/rsvp", attachUser, async (req, res) => {
    try {
      const status =
        typeof req.body?.status === "string" ? req.body.status : "";
      if (!["going", "interested", "declined"].includes(status))
        return res
          .status(400)
          .json({ message: "Choose going, interested, or declined" });
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, req.params.id))
        .limit(1);
      if (!event) return res.status(404).json({ message: "Event not found" });
      const [membership] = await db
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, event.communityId),
            eq(communityMemberships.userId, req.dbUser!.id),
            ne(communityMemberships.status, "banned"),
          ),
        )
        .limit(1);
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community before RSVPing" });
      const [attendance] = await db
        .insert(eventAttendees)
        .values({ eventId: event.id, userId: req.dbUser!.id, status })
        .onConflictDoUpdate({
          target: [eventAttendees.eventId, eventAttendees.userId],
          set: { status, updatedAt: new Date() },
        })
        .returning();
      void emitProjectionEvent({
        aggregateType: "event",
        aggregateId: event.id,
        eventType: "event.rsvp_changed",
        actorUserId: req.dbUser!.id,
        payload: { status },
        idempotencyKey: `event.rsvp:${event.id}:${req.dbUser!.id}:${status}`,
      }).catch((error) =>
        console.error("Failed to enqueue RSVP projection:", error),
      );
      res.json(attendance);
    } catch {
      res.status(500).json({ message: "Failed to save RSVP" });
    }
  });

  app.get(
    "/api/distribution/connections/:provider/authorize",
    attachUser,
    async (req, res) => {
      try {
        const provider = socialOAuthProviderForId(req.params.provider);
        if (!provider)
          return res
            .status(404)
            .json({ message: "This channel connection is not available yet" });
        if (
          !isSocialProviderConfigured(provider) ||
          !isSocialTokenEncryptionConfigured()
        ) {
          return res.status(503).json({
            message: "This channel is not activated for CreativesOS yet",
          });
        }

        const state = createSocialOAuthState();
        await db
          .delete(socialOAuthStates)
          .where(lt(socialOAuthStates.expiresAt, new Date()));
        await db.insert(socialOAuthStates).values({
          userId: req.dbUser!.id,
          provider: provider.id,
          stateHash: state.hash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        });
        res.redirect(buildSocialOAuthAuthorizationUrl(provider, state.value));
      } catch (error) {
        console.error("Unable to start social OAuth authorization:", error);
        res.status(500).json({ message: "Unable to start channel connection" });
      }
    },
  );

  app.get(
    "/api/distribution/connections/:provider/callback",
    attachUser,
    async (req, res) => {
      const provider = socialOAuthProviderForId(req.params.provider);
      const returnToConnections = (status: string) => {
        console.info("Social OAuth callback completed", {
          provider: provider?.id ?? "unknown",
          status,
        });
        return res.redirect(
          `/distribution/connections?${provider?.id ?? "channel"}=${encodeURIComponent(status)}`,
        );
      };
      if (!provider) return returnToConnections("unsupported");
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const authorizationError =
        typeof req.query.error === "string" ? req.query.error : "";
      if (!state) return returnToConnections("invalid_state");

      try {
        const [storedState] = await db
          .select()
          .from(socialOAuthStates)
          .where(
            and(
              eq(socialOAuthStates.stateHash, hashSocialOAuthState(state)),
              eq(socialOAuthStates.provider, provider.id),
            ),
          )
          .limit(1);
        if (
          !storedState ||
          storedState.userId !== req.dbUser!.id ||
          storedState.consumedAt ||
          storedState.expiresAt.getTime() < Date.now()
        ) {
          return returnToConnections("invalid_state");
        }
        const [consumedState] = await db
          .update(socialOAuthStates)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(socialOAuthStates.id, storedState.id),
              isNull(socialOAuthStates.consumedAt),
            ),
          )
          .returning({ id: socialOAuthStates.id });
        if (!consumedState) return returnToConnections("invalid_state");
        if (authorizationError || !code)
          return returnToConnections(authorizationError || "denied");
        if (
          !isSocialProviderConfigured(provider) ||
          !isSocialTokenEncryptionConfigured()
        )
          return returnToConnections("not_configured");

        const tokenResponse = await fetch(provider.tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: process.env[provider.clientIdEnv]!.trim(),
            client_secret: process.env[provider.clientSecretEnv]!.trim(),
            redirect_uri: socialOAuthRedirectUri(provider),
            grant_type: "authorization_code",
          }),
        });
        if (!tokenResponse.ok) {
          console.error("Social OAuth token exchange failed", {
            provider: provider.id,
            status: tokenResponse.status,
          });
          return returnToConnections("exchange_failed");
        }
        const tokens = (await tokenResponse.json()) as {
          access_token?: unknown;
          refresh_token?: unknown;
          expires_in?: unknown;
        };
        if (typeof tokens.access_token !== "string" || !tokens.access_token)
          return returnToConnections("exchange_failed");

        // The channel API provides an account id and display name without storing
        // a Google identity or any token material in the browser.
        const channelResponse = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          },
        );
        if (!channelResponse.ok) {
          console.error("Social OAuth account lookup failed", {
            provider: provider.id,
            status: channelResponse.status,
          });
          return returnToConnections("channel_lookup_failed");
        }
        const channelPayload = (await channelResponse.json()) as {
          items?: Array<{ id?: unknown; snippet?: { title?: unknown } }>;
        };
        const channel = channelPayload.items?.[0];
        if (!channel || typeof channel.id !== "string" || !channel.id)
          return returnToConnections("channel_required");
        const existing = await db
          .select()
          .from(socialConnections)
          .where(
            and(
              eq(socialConnections.provider, provider.id),
              eq(socialConnections.providerAccountId, channel.id),
            ),
          )
          .limit(1);
        const accountName =
          typeof channel.snippet?.title === "string" &&
          channel.snippet.title.trim()
            ? channel.snippet.title.trim()
            : "YouTube channel";
        const tokenExpiresAt =
          typeof tokens.expires_in === "number" &&
          Number.isFinite(tokens.expires_in)
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null;
        const update = {
          providerAccountName: accountName,
          status: "active",
          scopes: [...provider.scopes],
          accessTokenCiphertext: encryptSocialToken(tokens.access_token),
          tokenExpiresAt,
          lastValidatedAt: new Date(),
          lastErrorCode: null,
          updatedAt: new Date(),
        };
        if (existing[0] && existing[0].userId !== req.dbUser!.id)
          return returnToConnections("account_in_use");
        if (existing[0]) {
          await db
            .update(socialConnections)
            .set({
              ...update,
              refreshTokenCiphertext:
                typeof tokens.refresh_token === "string" && tokens.refresh_token
                  ? encryptSocialToken(tokens.refresh_token)
                  : existing[0].refreshTokenCiphertext,
            })
            .where(eq(socialConnections.id, existing[0].id));
        } else {
          await db.insert(socialConnections).values({
            userId: req.dbUser!.id,
            provider: provider.id,
            providerAccountId: channel.id,
            refreshTokenCiphertext:
              typeof tokens.refresh_token === "string" && tokens.refresh_token
                ? encryptSocialToken(tokens.refresh_token)
                : null,
            ...update,
          });
        }
        returnToConnections("connected");
      } catch (error) {
        console.error("Unable to finish social OAuth authorization:", error);
        returnToConnections("error");
      }
    },
  );

  app.delete(
    "/api/distribution/connections/:provider/:connectionId",
    attachUser,
    async (req, res) => {
      try {
        const provider = socialOAuthProviderForId(req.params.provider);
        if (!provider)
          return res
            .status(404)
            .json({ message: "This channel connection is not available yet" });
        const [connection] = await db
          .select()
          .from(socialConnections)
          .where(
            and(
              eq(socialConnections.id, req.params.connectionId),
              eq(socialConnections.userId, req.dbUser!.id),
              eq(socialConnections.provider, provider.id),
            ),
          )
          .limit(1);
        if (!connection)
          return res
            .status(404)
            .json({ message: "Channel connection not found" });
        if (provider.id === "youtube" && isSocialTokenEncryptionConfigured()) {
          try {
            const token =
              connection.refreshTokenCiphertext ??
              connection.accessTokenCiphertext;
            if (token) {
              await fetch("https://oauth2.googleapis.com/revoke", {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ token: decryptSocialToken(token) }),
              });
            }
          } catch (error) {
            // A local disconnect must always remove our credentials even when a
            // provider revocation endpoint is temporarily unavailable.
            console.error("Social OAuth token revocation failed:", error);
          }
        }
        await db
          .delete(socialConnections)
          .where(eq(socialConnections.id, connection.id));
        res.status(204).end();
      } catch (error) {
        console.error("Unable to disconnect social account:", error);
        res.status(500).json({ message: "Unable to disconnect channel" });
      }
    },
  );

  app.get("/api/distribution/connections", attachUser, async (req, res) => {
    try {
      const connections = await db
        .select({
          id: socialConnections.id,
          provider: socialConnections.provider,
          providerAccountName: socialConnections.providerAccountName,
          status: socialConnections.status,
          scopes: socialConnections.scopes,
          tokenExpiresAt: socialConnections.tokenExpiresAt,
          lastValidatedAt: socialConnections.lastValidatedAt,
          lastErrorCode: socialConnections.lastErrorCode,
          createdAt: socialConnections.createdAt,
          updatedAt: socialConnections.updatedAt,
        })
        .from(socialConnections)
        .where(eq(socialConnections.userId, req.dbUser!.id));
      res.json({
        providers: socialProviderDefinitions.map((provider) => ({
          id: provider.id,
          label: provider.label,
          connectionConfigured:
            isSocialProviderConfigured(provider) &&
            isSocialTokenEncryptionConfigured(),
          connectionAvailable: Boolean(socialOAuthProviderForId(provider.id)),
          connections: connections.filter(
            (connection) => connection.provider === provider.id,
          ),
        })),
      });
    } catch (error) {
      console.error("Failed to load social connections:", error);
      res.status(500).json({ message: "Unable to load channel connections" });
    }
  });

  app.get("/api/distribution-jobs", attachUser, async (req, res) => {
    const jobs = await db
      .select()
      .from(distributionJobs)
      .where(eq(distributionJobs.userId, req.dbUser!.id))
      .orderBy(desc(distributionJobs.createdAt));
    const jobIds = jobs.map((job) => job.id);
    const deliveries = jobIds.length
      ? await db
          .select({
            id: distributionDeliveryAttempts.id,
            distributionJobId: distributionDeliveryAttempts.distributionJobId,
            provider: distributionDeliveryAttempts.provider,
            status: distributionDeliveryAttempts.status,
            attemptCount: distributionDeliveryAttempts.attemptCount,
            providerContentId: distributionDeliveryAttempts.providerContentId,
            errorCode: distributionDeliveryAttempts.errorCode,
            nextAttemptAt: distributionDeliveryAttempts.nextAttemptAt,
            updatedAt: distributionDeliveryAttempts.updatedAt,
          })
          .from(distributionDeliveryAttempts)
          .where(
            inArray(distributionDeliveryAttempts.distributionJobId, jobIds),
          )
      : [];
    res.json(
      jobs.map((job) => ({
        ...job,
        deliveries: deliveries.filter(
          (delivery) => delivery.distributionJobId === job.id,
        ),
      })),
    );
  });

  app.post("/api/distribution-jobs", attachUser, async (req, res) => {
    try {
      const { content, format, platforms, scheduledFor } = req.body;
      const allowedFormats = new Set(["Text", "Image", "Video", "Story"]);
      const allowedPlatforms = new Set([
        "CreativesOS",
        "Instagram",
        "TikTok",
        "YouTube",
        "X",
        "LinkedIn",
      ]);
      const publishAt = new Date(scheduledFor);
      if (
        typeof content !== "string" ||
        !content.trim() ||
        content.length > 2200 ||
        !allowedFormats.has(format) ||
        !Array.isArray(platforms) ||
        platforms.length === 0 ||
        platforms.some((platform) => !allowedPlatforms.has(platform)) ||
        Number.isNaN(publishAt.getTime())
      ) {
        return res.status(400).json({ message: "Invalid distribution job" });
      }

      const rawAssetIds: string[] = Array.isArray(req.body?.assetIds)
        ? req.body.assetIds
            .filter(
              (value: unknown): value is string => typeof value === "string",
            )
            .slice(0, 4)
        : [];
      const assetIds: string[] = Array.from(new Set<string>(rawAssetIds));
      if (assetIds.length > 0) {
        const selectedAssets = await db
          .select({
            id: assets.id,
            status: assets.status,
            visibility: assets.visibility,
            kind: assets.kind,
            mimeType: assets.mimeType,
          })
          .from(assets)
          .where(
            and(
              eq(assets.ownerUserId, req.dbUser!.id),
              inArray(assets.id, assetIds),
            ),
          );
        if (
          selectedAssets.length !== assetIds.length ||
          selectedAssets.some(
            (asset) =>
              asset.status !== "ready" || asset.visibility !== "public",
          )
        ) {
          return res.status(400).json({
            message: "Distribution media must be your ready public assets",
          });
        }
        if (
          platforms.includes("YouTube") &&
          !selectedAssets.some(
            (asset) =>
              asset.kind === "video" && asset.mimeType?.startsWith("video/"),
          )
        ) {
          return res.status(400).json({
            message:
              "YouTube distribution requires one ready public video asset",
          });
        }
      } else if (platforms.includes("YouTube")) {
        return res.status(400).json({
          message: "YouTube distribution requires one ready public video asset",
        });
      }
      const [job] = await db
        .insert(distributionJobs)
        .values({
          userId: req.dbUser!.id,
          content: content.trim(),
          format,
          platforms,
          assetIds,
          scheduledFor: publishAt,
          status: "scheduled",
        })
        .returning();
      const campaignDeliverableId =
        typeof req.body?.campaignDeliverableId === "string"
          ? req.body.campaignDeliverableId
          : null;
      if (campaignDeliverableId) {
        const [deliverable] = await db
          .select()
          .from(campaignDeliverables)
          .where(eq(campaignDeliverables.id, campaignDeliverableId))
          .limit(1);
        if (!deliverable) {
          await db
            .delete(distributionJobs)
            .where(eq(distributionJobs.id, job.id));
          return res
            .status(404)
            .json({ message: "Campaign deliverable not found" });
        }
        const [campaign] = await db
          .select()
          .from(campaigns)
          .where(eq(campaigns.id, deliverable.campaignId))
          .limit(1);
        if (
          !campaign ||
          !(await userCanManageBusiness(req.dbUser!.id, campaign.businessId))
        ) {
          await db
            .delete(distributionJobs)
            .where(eq(distributionJobs.id, job.id));
          return res.status(403).json({
            message: "You do not have access to that campaign deliverable",
          });
        }
        await db
          .update(campaignDeliverables)
          .set({
            distributionJobId: job.id,
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(campaignDeliverables.id, deliverable.id));
      }
      void emitProjectionEvent({
        aggregateType: "distribution_job",
        aggregateId: job.id,
        eventType: "distribution.scheduled",
        actorUserId: req.dbUser!.id,
        payload: { platforms, scheduledFor: job.scheduledFor },
        idempotencyKey: `distribution.scheduled:${job.id}`,
      }).catch((error) =>
        console.error("Failed to enqueue distribution projection:", error),
      );

      // A "Publish now" timestamp originates in the browser and can land a
      // fraction of a second ahead of the server clock. Treat that small
      // skew as immediate rather than leaving a user-facing publish request
      // waiting for the next background interval.
      if (publishAt.getTime() <= Date.now() + 5_000) {
        await processDueDistributionJobs();
        const [processedJob] = await db
          .select()
          .from(distributionJobs)
          .where(eq(distributionJobs.id, job.id));
        return res.status(201).json(processedJob ?? job);
      }

      res.status(201).json(job);
    } catch (error) {
      console.error("Failed to create distribution job:", error);
      res.status(500).json({ message: "Failed to create distribution job" });
    }
  });

  app.post("/api/distribution-jobs/:id/cancel", attachUser, async (req, res) => {
    const [job] = await db.select().from(distributionJobs).where(and(
      eq(distributionJobs.id, req.params.id),
      eq(distributionJobs.userId, req.dbUser!.id),
    )).limit(1);
    if (!job) return res.status(404).json({ message: "Distribution job not found" });
    if (!new Set(["scheduled", "needs_connection", "needs_provider", "failed"]).has(job.status))
      return res.status(409).json({ message: "This distribution job can no longer be canceled" });
    const [canceled] = await db.update(distributionJobs)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(distributionJobs.id, job.id), eq(distributionJobs.status, job.status)))
      .returning();
    if (!canceled) return res.status(409).json({ message: "Distribution job changed before it could be canceled" });
    res.json(canceled);
  });

  app.post("/api/distribution-jobs/:id/retry", attachUser, async (req, res) => {
    const [job] = await db.select().from(distributionJobs).where(and(
      eq(distributionJobs.id, req.params.id),
      eq(distributionJobs.userId, req.dbUser!.id),
    )).limit(1);
    if (!job) return res.status(404).json({ message: "Distribution job not found" });
    if (!new Set(["needs_connection", "needs_provider", "failed", "canceled"]).has(job.status))
      return res.status(409).json({ message: "This distribution job is not retryable" });
    const [queued] = await db.update(distributionJobs)
      .set({ status: "scheduled", scheduledFor: new Date(), updatedAt: new Date() })
      .where(and(eq(distributionJobs.id, job.id), eq(distributionJobs.status, job.status)))
      .returning();
    if (!queued) return res.status(409).json({ message: "Distribution job changed before it could be retried" });
    await processDueDistributionJobs();
    const [processed] = await db.select().from(distributionJobs).where(eq(distributionJobs.id, job.id)).limit(1);
    res.json(processed ?? queued);
  });

  app.get("/api/cart", attachUser, async (req, res) => {
    try {
      res.json(await getAccountCartItems(req.dbUser!.id));
    } catch (error) {
      console.error("Failed to fetch account cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart/items", attachUser, async (req, res) => {
    try {
      const productIds = normalizeCartProductIds([req.body?.productId], 1);
      const allowedIds = await purchasableCartProductIds(
        req.dbUser!.id,
        productIds,
      );
      if (!allowedIds.length) {
        return res.status(409).json({
          message: "This offer is unavailable, already owned, or belongs to you",
        });
      }
      const inserted = await db
        .insert(shoppingCartItems)
        .values({ userId: req.dbUser!.id, productId: allowedIds[0] })
        .onConflictDoNothing()
        .returning({ id: shoppingCartItems.id });
      res.status(inserted.length ? 201 : 200).json({
        added: inserted.length > 0,
        items: await getAccountCartItems(req.dbUser!.id),
      });
    } catch (error) {
      console.error("Failed to add account cart item:", error);
      res.status(500).json({ message: "Failed to add offer to cart" });
    }
  });

  app.post("/api/cart/merge", attachUser, async (req, res) => {
    try {
      const requestedIds = normalizeCartProductIds(req.body?.productIds);
      const allowedIds = await purchasableCartProductIds(
        req.dbUser!.id,
        requestedIds,
      );
      if (allowedIds.length) {
        await db
          .insert(shoppingCartItems)
          .values(
            allowedIds.map((productId) => ({
              userId: req.dbUser!.id,
              productId,
            })),
          )
          .onConflictDoNothing();
      }
      res.json(await getAccountCartItems(req.dbUser!.id));
    } catch (error) {
      console.error("Failed to merge account cart:", error);
      res.status(500).json({ message: "Failed to merge cart" });
    }
  });

  app.delete("/api/cart/items/:productId", attachUser, async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      if (!Number.isInteger(productId) || productId < 1) {
        return res.status(400).json({ message: "Invalid offer" });
      }
      await db
        .delete(shoppingCartItems)
        .where(
          and(
            eq(shoppingCartItems.userId, req.dbUser!.id),
            eq(shoppingCartItems.productId, productId),
          ),
        );
      res.status(204).end();
    } catch (error) {
      console.error("Failed to remove account cart item:", error);
      res.status(500).json({ message: "Failed to remove offer from cart" });
    }
  });

  app.delete("/api/cart", attachUser, async (req, res) => {
    try {
      await db
        .delete(shoppingCartItems)
        .where(eq(shoppingCartItems.userId, req.dbUser!.id));
      res.status(204).end();
    } catch (error) {
      console.error("Failed to clear account cart:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  app.get("/api/purchases", attachUser, async (req, res) => {
    try {
      // Demo mode stays fully in-memory. Outside demo mode, entitlement is
      // the access source of truth; this legacy route keeps its established
      // response shape while clients transition to the durable model.
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res.json(await storage.getPurchasesByBuyerId(req.dbUser!.id));
      }
      const rows = await db
        .select({ entitlement: entitlements, product: products, seller: publicUserFields })
        .from(entitlements)
        .innerJoin(products, eq(entitlements.productId, products.id))
        .innerJoin(users, eq(products.userId, users.id))
        .where(
          and(
            eq(entitlements.userId, req.dbUser!.id),
            eq(entitlements.status, "active"),
          ),
        )
        .orderBy(desc(entitlements.startsAt));
      res.json(
        rows.map(({ entitlement, product, seller }) => ({
          id: entitlement.id,
          buyerId: entitlement.userId,
          productId: product.id,
          status: entitlement.status,
          paymentProvider: entitlement.sourceOrderId ? "order" : "legacy",
          purchasedAt: entitlement.startsAt,
          product: { ...product, user: seller },
        })),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchases" });
    }
  });

  // Provider-neutral payment preparation. The client may request this safely
  // more than once with the same idempotency key; only a verified provider
  // webhook will later transition the order and grant entitlements.
  app.get("/api/orders", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") return res.json([]);
      const rows = await db
        .select()
        .from(orders)
        .where(eq(orders.buyerId, req.dbUser!.id))
        .orderBy(desc(orders.createdAt));
      const ids = rows.map((order) => order.id);
      const items = ids.length
        ? await db
            .select()
            .from(orderItems)
            .where(inArray(orderItems.orderId, ids))
        : [];
      res.json(
        rows.map((order) => ({
          ...order,
          items: items.filter((item) => item.orderId === order.id),
        })),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/sales", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") return res.json([]);
      const rows = await db
        .select({
          order: orders,
          item: orderItems,
          buyerId: users.id,
          buyerUsername: users.username,
          buyerDisplayName: users.displayName,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(products, eq(products.id, orderItems.productId))
        .innerJoin(users, eq(users.id, orders.buyerId))
        .where(eq(products.userId, req.dbUser!.id))
        .orderBy(desc(orders.createdAt));
      const grouped = new Map<string, typeof rows[number]["order"] & {
        buyer: { id: number; username: string; displayName: string };
        items: typeof rows[number]["item"][];
      }>();
      for (const row of rows) {
        const existing = grouped.get(row.order.id);
        if (existing) {
          existing.items.push(row.item);
          continue;
        }
        grouped.set(row.order.id, {
          ...row.order,
          buyer: { id: row.buyerId, username: row.buyerUsername, displayName: row.buyerDisplayName },
          items: [row.item],
        });
      }
      res.json(Array.from(grouped.values()));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch creator sales" });
    }
  });

  app.post("/api/orders", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res
          .status(501)
          .json({ message: "Order preparation is unavailable in demo mode" });
      }
      const idempotencyKey =
        typeof req.body?.idempotencyKey === "string"
          ? req.body.idempotencyKey.trim()
          : "";
      const rawProductIds = Array.isArray(req.body?.productIds)
        ? req.body.productIds
        : [];
      const productIds = Array.from(
        new Set(
          rawProductIds.filter((value: unknown) => Number.isInteger(value)),
        ),
      ) as number[];
      if (!idempotencyKey || idempotencyKey.length > 120) {
        return res
          .status(400)
          .json({ message: "A valid idempotency key is required" });
      }
      if (!productIds.length || productIds.length > 25) {
        return res
          .status(400)
          .json({ message: "Choose between 1 and 25 offers" });
      }

      const [existing] = await db
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        if (existing.buyerId !== req.dbUser!.id)
          return res
            .status(409)
            .json({ message: "Idempotency key is already in use" });
        const items = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderId, existing.id));
        return res.json({ ...existing, items });
      }

      const productsToOrder = await Promise.all(
        productIds.map((productId) => storage.getProductById(productId)),
      );
      if (productsToOrder.some((product) => !product))
        return res
          .status(404)
          .json({ message: "One or more offers are no longer available" });
      const offers = productsToOrder.filter(
        (product): product is NonNullable<typeof product> => Boolean(product),
      );
      if (offers.some((product) => product.status !== "published")) {
        return res.status(409).json({
          message: "One or more offers are not available for purchase",
        });
      }
      if (offers.some((product) => product.userId === req.dbUser!.id)) {
        return res
          .status(400)
          .json({ message: "You cannot purchase your own offer" });
      }
      const schedules = new Set(
        offers.map((product) =>
          product.billingModel === "recurring"
            ? `recurring:${product.billingInterval ?? "month"}`
            : "one_time",
        ),
      );
      if (schedules.size !== 1) {
        return res.status(409).json({
          message: "Checkout offers must use the same billing schedule",
        });
      }
      const alreadyOwned = await db
        .select({ productId: entitlements.productId })
        .from(entitlements)
        .where(
          and(
            eq(entitlements.userId, req.dbUser!.id),
            eq(entitlements.status, "active"),
            inArray(entitlements.productId, productIds),
          ),
        );
      if (alreadyOwned.length) {
        return res.status(409).json({
          message: "One or more offers are already in your purchases",
        });
      }
      const creatorOffers = offers.filter(
        (product) => product.payoutMode === "creator",
      );
      if (creatorOffers.length) {
        const sellerId = creatorOffers[0].userId;
        if (
          creatorOffers.length !== offers.length ||
          creatorOffers.some((product) => product.userId !== sellerId)
        ) {
          return res.status(409).json({
            message: "Creator checkout supports one creator's offers per order",
          });
        }
        const [payoutAccount] = await db
          .select()
          .from(creatorPaymentAccounts)
          .where(eq(creatorPaymentAccounts.userId, sellerId))
          .limit(1);
        if (
          !payoutAccount ||
          !payoutAccount.chargesEnabled ||
          !payoutAccount.payoutsEnabled
        ) {
          return res
            .status(409)
            .json({ message: "This creator is still completing payout setup" });
        }
      }
      const total = offers.reduce((sum, product) => sum + product.price, 0);

      const order = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(orders)
          .values({
            buyerId: req.dbUser!.id,
            status: "payment_required",
            currency: "usd",
            subtotalAmount: total,
            totalAmount: total,
            idempotencyKey,
          })
          .returning();
        const items = await tx
          .insert(orderItems)
          .values(
            offers.map((product) => ({
              orderId: created.id,
              productId: product.id,
              titleSnapshot: product.title,
              unitAmount: product.price,
              quantity: 1,
              productTypeSnapshot: product.productType,
              billingModelSnapshot: product.billingModel,
              billingIntervalSnapshot: product.billingInterval,
            })),
          )
          .returning();
        return { ...created, items };
      });
      res.status(201).json(order);
    } catch (error: any) {
      if (error?.code === "23505")
        return res
          .status(409)
          .json({ message: "This checkout was already prepared" });
      res.status(500).json({ message: "Failed to prepare order" });
    }
  });

  // This is intentionally limited to demo mode. Production entitlement creation
  // must be triggered by a verified Stripe webhook, never by a client request.
  app.post("/api/products/:id/demo-access", attachUser, async (req, res) => {
    try {
      if (process.env.CREATOROS_DEMO_MODE !== "true") {
        return res
          .status(501)
          .json({ message: "Payments are not connected yet" });
      }

      const productId = parseInt(req.params.id);
      const product = await storage.getProductById(productId);
      if (!product)
        return res.status(404).json({ message: "Product not found" });
      if (product.userId === req.dbUser!.id) {
        return res
          .status(400)
          .json({ message: "You already own this product" });
      }

      const purchase = await storage.createPurchase({
        buyerId: req.dbUser!.id,
        productId,
        status: "active",
        paymentProvider: "demo",
      });
      await createActivityNotification({
        recipientId: product.userId,
        actorId: req.dbUser!.id,
        type: "purchase",
        message: `${req.dbUser!.displayName} purchased ${product.title}`,
        linkTo: `/marketplace/product/${product.id}`,
      });
      res.status(201).json(purchase);
    } catch (error) {
      res.status(500).json({ message: "Failed to grant demo access" });
    }
  });

  app.post("/api/products", attachUser, async (req, res) => {
    try {
      const { title, description, price, category, imageUrl } = req.body ?? {};
      const allowedCategories = new Set([
        "Course",
        "Community",
        "Membership",
        "Digital Asset",
        "Coaching",
        "Software",
      ]);
      const parsedPrice = typeof price === "number" ? price : Number(price);
      if (
        typeof title !== "string" ||
        !title.trim() ||
        title.trim().length > 160 ||
        typeof description !== "string" ||
        !description.trim() ||
        description.trim().length > 10000 ||
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > 1_000_000 ||
        typeof category !== "string" ||
        !allowedCategories.has(category) ||
        (imageUrl !== null &&
          imageUrl !== undefined &&
          (typeof imageUrl !== "string" || imageUrl.length > 2048))
      ) {
        return res.status(400).json({ message: "Invalid offer details" });
      }
      const requestedBusinessId =
        typeof req.body?.businessId === "string" ? req.body.businessId : null;
      const businessId =
        requestedBusinessId ?? (await ensureDefaultBusiness(req.dbUser!)).id;
      if (!(await userCanManageBusiness(req.dbUser!.id, businessId))) {
        return res
          .status(403)
          .json({ message: "You do not have access to that business" });
      }
      let commercialTerms;
      try {
        commercialTerms = normalizeProductCommercialTerms({
          productType: req.body?.productType,
          billingModel: req.body?.billingModel,
          billingInterval: req.body?.billingInterval,
          category,
        });
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid offer billing" });
      }
      const product = await storage.createProduct({
        title: title.trim(),
        description: description.trim(),
        price: parsedPrice,
        category,
        imageUrl: imageUrl?.trim?.() || null,
        userId: req.dbUser!.id,
        businessId,
        status: "draft",
        ...commercialTerms,
      });
      void emitProjectionEvent({
        aggregateType: "product",
        aggregateId: product.id,
        eventType: "product.created",
        actorUserId: req.dbUser!.id,
        payload: { businessId, category: product.category },
        idempotencyKey: `product.created:${product.id}`,
      }).catch((error) =>
        console.error("Failed to enqueue product projection:", error),
      );
      res.status(201).json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch("/api/products/:id", attachUser, async (req, res) => {
    try {
      const productId = Number(req.params.id);
      const existing = Number.isInteger(productId)
        ? await storage.getProductById(productId)
        : undefined;
      if (!existing)
        return res.status(404).json({ message: "Product not found" });
      if (existing.userId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You can only edit your own offer" });

      const { title, description, price, category, imageUrl } = req.body ?? {};
      const allowedCategories = new Set([
        "Course",
        "Community",
        "Membership",
        "Digital Asset",
        "Coaching",
        "Software",
      ]);
      const parsedPrice = typeof price === "number" ? price : Number(price);
      if (
        typeof title !== "string" ||
        !title.trim() ||
        title.trim().length > 160 ||
        typeof description !== "string" ||
        !description.trim() ||
        description.trim().length > 10000 ||
        !Number.isFinite(parsedPrice) ||
        parsedPrice < 0 ||
        parsedPrice > 1_000_000 ||
        typeof category !== "string" ||
        !allowedCategories.has(category) ||
        (imageUrl !== null &&
          imageUrl !== undefined &&
          (typeof imageUrl !== "string" || imageUrl.length > 2048))
      ) {
        return res.status(400).json({ message: "Invalid offer details" });
      }

      let businessId = existing.businessId;
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "businessId")) {
        businessId =
          typeof req.body.businessId === "string" && req.body.businessId
            ? req.body.businessId
            : null;
        if (
          businessId &&
          !(await userCanManageBusiness(req.dbUser!.id, businessId))
        ) {
          return res
            .status(403)
            .json({ message: "You do not have access to that business" });
        }
      }
      let payoutMode: "platform" | "creator" =
        existing.payoutMode === "creator" ? "creator" : "platform";
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "payoutMode")) {
        if (
          req.body.payoutMode !== "platform" &&
          req.body.payoutMode !== "creator"
        ) {
          return res.status(400).json({ message: "Invalid payout mode" });
        }
        payoutMode = req.body.payoutMode;
        if (payoutMode === "creator") {
          const [payoutAccount] = await db
            .select()
            .from(creatorPaymentAccounts)
            .where(eq(creatorPaymentAccounts.userId, req.dbUser!.id))
            .limit(1);
          if (
            !payoutAccount ||
            !payoutAccount.chargesEnabled ||
            !payoutAccount.payoutsEnabled
          ) {
            return res.status(409).json({
              message:
                "Connect and complete your Stripe payout account before enabling creator payouts",
            });
          }
        }
      }
      let status: "draft" | "published" | "archived" =
        existing.status === "published" || existing.status === "archived"
          ? existing.status
          : "draft";
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "status")) {
        if (!["draft", "published", "archived"].includes(req.body.status))
          return res.status(400).json({ message: "Invalid offer status" });
        status = req.body.status;
      }
      let commercialTerms;
      try {
        commercialTerms = normalizeProductCommercialTerms({
          productType: req.body?.productType ?? existing.productType,
          billingModel: req.body?.billingModel ?? existing.billingModel,
          billingInterval: Object.prototype.hasOwnProperty.call(req.body ?? {}, "billingInterval")
            ? req.body.billingInterval
            : existing.billingInterval,
          category,
        });
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Invalid offer billing" });
      }
      let product = await storage.updateProduct(productId, {
        title: title.trim(),
        description: description.trim(),
        price: parsedPrice,
        category,
        imageUrl: imageUrl?.trim?.() || null,
        businessId,
        payoutMode,
        status,
        ...commercialTerms,
      });
      if (
        status === "published"
        && !product.communityId
        && ["community", "membership"].includes(product.productType)
      ) {
        const provisioned = await db.transaction(async (tx) => {
          const [community] = await tx.insert(communities).values({
            name: product.title,
            description: product.description,
            iconColor: "#1d9bf0",
          }).returning();
          const [claimed] = await tx.update(products).set({ communityId: community.id }).where(and(
            eq(products.id, product.id),
            isNull(products.communityId),
          )).returning();
          if (!claimed) {
            await tx.delete(communities).where(eq(communities.id, community.id));
            return null;
          }
          await tx.insert(communityMemberships).values({
            userId: req.dbUser!.id,
            communityId: community.id,
            role: "owner",
          }).onConflictDoNothing();
          await tx.insert(channels).values({ communityId: community.id, name: "general" });
          return claimed;
        });
        if (provisioned) product = { ...product, ...provisioned };
      }
      void emitProjectionEvent({
        aggregateType: "product",
        aggregateId: product.id,
        eventType: "product.updated",
        actorUserId: req.dbUser!.id,
        payload: { businessId: product.businessId, category: product.category },
        idempotencyKey: `product.updated:${product.id}:${Date.now()}`,
      }).catch((error) =>
        console.error("Failed to enqueue product update projection:", error),
      );
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to update offer" });
    }
  });

  // AI Agent routes
  app.get("/api/ai-agents", attachUser, async (_req, res) => {
    try {
      res.json(await storage.getAIAgents());
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI agents" });
    }
  });

  app.get("/api/ai-agents/user/:userId", attachUser, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "A valid user ID is required" });
      }
      if (req.dbUser!.id !== userId) {
        return res.status(403).json({ message: "You can only access your own AI agents" });
      }
      res.json(await storage.getUserAIAgents(userId));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user AI agents" });
    }
  });

  app.get("/api/ai-agents/:id", attachUser, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      if (!Number.isInteger(agentId) || agentId <= 0) {
        return res.status(400).json({ message: "A valid AI agent ID is required" });
      }
      const agent = await storage.getAIAgentById(agentId);
      if (!agent) return res.status(404).json({ message: "AI agent not found" });
      if (!canUseAiAgent(req.dbUser!.id, agent)) {
        return res.status(403).json({ message: "You cannot access this AI agent" });
      }
      res.json(agent);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI agent" });
    }
  });

  app.post("/api/ai-agents", attachUser, async (req, res) => {
    try {
      const parsed = createAiAgentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "The AI agent details are invalid" });
      }
      const agent = await storage.createAIAgent({
        ...parsed.data,
        userId: req.dbUser!.id,
        isCustom: true,
      });
      res.status(201).json(agent);
    } catch (error) {
      res.status(500).json({ message: "Failed to create AI agent" });
    }
  });

  app.patch("/api/ai-agents/:id", attachUser, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      if (!Number.isInteger(agentId) || agentId <= 0) {
        return res.status(400).json({ message: "A valid AI agent ID is required" });
      }
      const existing = await storage.getAIAgentById(agentId);
      if (!existing) return res.status(404).json({ message: "AI agent not found" });
      if (!canManageAiAgent(req.dbUser!.id, existing)) {
        return res.status(403).json({ message: "You cannot change this AI agent" });
      }
      const parsed = updateAiAgentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "The AI agent details are invalid" });
      }
      res.json(await storage.updateAIAgent(agentId, parsed.data));
    } catch (error) {
      res.status(500).json({ message: "Failed to update AI agent" });
    }
  });

  app.delete("/api/ai-agents/:id", attachUser, async (req, res) => {
    try {
      const agentId = Number(req.params.id);
      if (!Number.isInteger(agentId) || agentId <= 0) {
        return res.status(400).json({ message: "A valid AI agent ID is required" });
      }
      const existing = await storage.getAIAgentById(agentId);
      if (!existing) return res.status(404).json({ message: "AI agent not found" });
      if (!canManageAiAgent(req.dbUser!.id, existing)) {
        return res.status(403).json({ message: "You cannot delete this AI agent" });
      }
      await storage.deleteAIAgent(agentId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete AI agent" });
    }
  });

  // AI Chat routes
  app.get("/api/ai-chats/:agentId/:userId", attachUser, async (req, res) => {
    try {
      const agentId = Number(req.params.agentId);
      const userId = Number(req.params.userId);
      if (!Number.isInteger(agentId) || agentId <= 0 || !Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Valid AI agent and user IDs are required" });
      }
      if (req.dbUser!.id !== userId) {
        return res.status(403).json({ message: "You can only access your own AI chats" });
      }
      const agent = await storage.getAIAgentById(agentId);
      if (!agent) return res.status(404).json({ message: "AI agent not found" });
      if (!canUseAiAgent(req.dbUser!.id, agent)) {
        return res.status(403).json({ message: "You cannot access this AI agent" });
      }
      res.json(await storage.getAIChatsByAgentId(agentId, userId));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI chats" });
    }
  });

  app.post("/api/ai-chats", attachUser, async (req, res) => {
    try {
      const parsed = createAiChatInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "The AI chat details are invalid" });
      }
      const agent = await storage.getAIAgentById(parsed.data.agentId);
      if (!agent) return res.status(404).json({ message: "AI agent not found" });
      if (!canUseAiAgent(req.dbUser!.id, agent)) {
        return res.status(403).json({ message: "You cannot use this AI agent" });
      }
      const chat = await storage.createAIChat({ ...parsed.data, userId: req.dbUser!.id });
      res.status(201).json(chat);
    } catch (error) {
      res.status(500).json({ message: "Failed to create AI chat" });
    }
  });

  app.put("/api/ai-chats/:id", attachUser, async (req, res) => {
    try {
      const chatId = Number(req.params.id);
      if (!Number.isInteger(chatId) || chatId <= 0) {
        return res.status(400).json({ message: "A valid AI chat ID is required" });
      }
      const [existing] = await db.select().from(aiChats).where(eq(aiChats.id, chatId)).limit(1);
      if (!existing) return res.status(404).json({ message: "AI chat not found" });
      if (existing.userId !== req.dbUser!.id) {
        return res.status(403).json({ message: "You can only update your own AI chats" });
      }
      const parsed = aiChatMessagesSchema.safeParse(req.body.messages);
      if (!parsed.success) {
        return res.status(400).json({ message: "The AI chat messages are invalid" });
      }
      const agent = await storage.getAIAgentById(existing.agentId);
      if (!agent || !canUseAiAgent(req.dbUser!.id, agent)) {
        return res.status(403).json({ message: "You cannot use this AI agent" });
      }
      res.json(await storage.updateAIChat(chatId, parsed.data));
    } catch (error) {
      res.status(500).json({ message: "Failed to update AI chat" });
    }
  });

  // OpenAI integration for AI chat
  app.post("/api/ai-chat/message", attachUser, async (req, res) => {
    try {
      const parsed = aiChatMessageInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "A valid AI agent and message are required" });
      }
      const { agentId, message } = parsed.data;
      const agent = await storage.getAIAgentById(agentId);
      if (!agent) return res.status(404).json({ message: "AI agent not found" });
      if (!canUseAiAgent(req.dbUser!.id, agent)) {
        return res.status(403).json({ message: "You cannot use this AI agent" });
      }

      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res.json({
          reply: `Demo response from CreativesOS: I received “${message.trim()}”. Configure OPENAI_API_KEY to use the live assistant.`,
        });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          message: "The CreativesOS AI assistant is not activated yet.",
        });
      }

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: agent.systemPrompt,
          },
          { role: "user", content: message },
        ],
      });

      res.json({ reply: response.choices[0].message.content });
    } catch (error: any) {
      console.error("OpenAI API error:", error);
      if (error?.status === 429 || error?.code === "insufficient_quota") {
        return res.status(503).json({
          message:
            "AI is temporarily unavailable while its provider quota is restored. Please try again later.",
        });
      }
      res.status(502).json({
        message:
          "The AI provider could not complete this request. Please try again later.",
      });
    }
  });

  // Community routes
  app.get("/api/communities", async (req, res) => {
    try {
      const communityRows = await storage.getCommunities();
      if (process.env.CREATOROS_DEMO_MODE === "true" || communityRows.length === 0) {
        return res.json(communityRows.map((community) => ({ ...community, accessProductId: null })));
      }
      const accessOffers = await db.select({ id: products.id, communityId: products.communityId })
        .from(products)
        .where(and(
          eq(products.status, "published"),
          inArray(products.communityId, communityRows.map((community) => community.id)),
          inArray(products.productType, ["community", "membership"]),
        ));
      const offerByCommunity = new Map(accessOffers.map((offer) => [offer.communityId, offer.id]));
      res.json(communityRows.map((community) => ({
        ...community,
        accessProductId: offerByCommunity.get(community.id) ?? null,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch communities" });
    }
  });

  app.get("/api/communities/owned", attachUser, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: communities.id,
          name: communities.name,
          description: communities.description,
          iconColor: communities.iconColor,
        })
        .from(communities)
        .innerJoin(
          communityMemberships,
          eq(communityMemberships.communityId, communities.id),
        )
        .where(
          and(
            eq(communityMemberships.userId, req.dbUser!.id),
            eq(communityMemberships.role, "owner"),
            eq(communityMemberships.status, "active"),
            isNull(communities.archivedAt),
          ),
        )
        .orderBy(desc(communities.createdAt));
      res.json(rows);
    } catch {
      res.status(500).json({ message: "Could not load owned communities" });
    }
  });

  app.get("/api/communities/:id", async (req, res) => {
    try {
      const community = await storage.getCommunityById(parseInt(req.params.id));
      if (!community) {
        return res.status(404).json({ message: "Community not found" });
      }
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res.json({ ...community, accessProductId: null });
      }
      const [accessOffer] = await db.select({ id: products.id })
        .from(products)
        .where(and(
          eq(products.communityId, community.id),
          eq(products.status, "published"),
          inArray(products.productType, ["community", "membership"]),
        ))
        .limit(1);
      res.json({ ...community, accessProductId: accessOffer?.id ?? null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community" });
    }
  });

  app.post("/api/communities", attachUser, async (req, res) => {
    try {
      const parsed = createCommunityInputSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          message:
            "A community needs a valid name, description, and icon color",
        });
      const community =
        process.env.CREATOROS_DEMO_MODE === "true"
          ? await storage.createCommunity(parsed.data)
          : await db.transaction(async (tx) => {
              const [created] = await tx
                .insert(communities)
                .values(parsed.data)
                .returning();
              await tx.insert(communityMemberships).values({
                userId: req.dbUser!.id,
                communityId: created.id,
                role: "owner",
              });
              await tx.insert(channels).values({
                communityId: created.id,
                name: "general",
              });
              return created;
            });
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        await storage.joinCommunity({
          userId: req.dbUser!.id,
          communityId: community.id,
          role: "owner",
        });
        await storage.createChannel({
          communityId: community.id,
          name: "general",
        });
      }
      res.status(201).json(community);
    } catch (error) {
      console.error("Failed to create community:", error);
      res.status(500).json({ message: "Failed to create community" });
    }
  });

  app.get("/api/communities/:id/membership", attachUser, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      if (
        !Number.isInteger(communityId) ||
        !(await storage.getCommunityById(communityId))
      )
        return res.status(404).json({ message: "Community not found" });
      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        communityId,
      );
      res.json({
        isMember: Boolean(membership),
        membership: membership ?? null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch community membership" });
    }
  });

  app.get("/api/communities/:id/members", attachUser, async (req, res) => {
    try {
      const communityId = Number(req.params.id);
      if (
        !Number.isInteger(communityId) ||
        !(await storage.getCommunityById(communityId))
      )
        return res.status(404).json({ message: "Community not found" });
      const actor = await storage.getCommunityMembership(
        req.dbUser!.id,
        communityId,
      );
      if (!actor)
        return res
          .status(403)
          .json({ message: "Join this community to view its members" });
      const canManage = ["owner", "admin"].includes(actor.role);
      const rows = await db
        .select({
          userId: users.id,
          username: users.username,
          displayName: users.displayName,
          profileImageUrl: users.profileImageUrl,
          role: communityMemberships.role,
          status: communityMemberships.status,
          moderationReason: communityMemberships.moderationReason,
          joinedAt: communityMemberships.joinedAt,
        })
        .from(communityMemberships)
        .innerJoin(users, eq(users.id, communityMemberships.userId))
        .where(
          canManage
            ? eq(communityMemberships.communityId, communityId)
            : and(
                eq(communityMemberships.communityId, communityId),
                ne(communityMemberships.status, "banned"),
              ),
        )
        .orderBy(desc(communityMemberships.joinedAt));
      res.json(rows);
    } catch {
      res.status(500).json({ message: "Could not load community members" });
    }
  });

  app.patch(
    "/api/communities/:id/members/:userId",
    attachUser,
    async (req, res) => {
      try {
        const update = updateCommunityMemberInputSchema.safeParse(req.body);
        if (!update.success)
          return res.status(400).json({
            message: "Provide one valid role or moderation status",
          });
        const communityId = Number(req.params.id);
        const targetUserId = Number(req.params.userId);
        if (
          !Number.isInteger(communityId) ||
          !Number.isInteger(targetUserId) ||
          !(await storage.getCommunityById(communityId))
        )
          return res
            .status(404)
            .json({ message: "Community or member not found" });
        const actor = await storage.getCommunityMembership(
          req.dbUser!.id,
          communityId,
        );
        const [target] = await db
          .select()
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, communityId),
              eq(communityMemberships.userId, targetUserId),
            ),
          )
          .limit(1);
        if (!actor || !target)
          return res
            .status(403)
            .json({ message: "You cannot manage this member" });

        if ("role" in update.data) {
          if (
            !isCommunityRole(update.data.role) ||
            !canAssignCommunityRole(actor, target, update.data.role)
          )
            return res
              .status(403)
              .json({ message: "You cannot assign that community role" });
          const [membership] = await db
            .update(communityMemberships)
            .set({ role: update.data.role })
            .where(eq(communityMemberships.id, target.id))
            .returning();
          return res.json(membership);
        }

        if ("status" in update.data) {
          const reason = update.data.reason ?? "";
          if (
            !isCommunityMemberStatus(update.data.status) ||
            !canModerateCommunityMember(actor, target, update.data.status)
          )
            return res
              .status(403)
              .json({ message: "You cannot apply that moderation action" });
          const [membership] = await db
            .update(communityMemberships)
            .set({
              status: update.data.status,
              moderationReason:
                update.data.status === "active" ? null : reason || null,
              moderatedAt: new Date(),
            })
            .where(eq(communityMemberships.id, target.id))
            .returning();
          await db.insert(communityModerationActions).values({
            communityId,
            targetUserId,
            actorUserId: req.dbUser!.id,
            action:
              update.data.status === "active"
                ? "restored"
                : update.data.status,
            reason: update.data.status === "active" ? null : reason || null,
          });
          return res.json(membership);
        }

        return res.status(400).json({ message: "Invalid member update" });
      } catch {
        res.status(500).json({ message: "Could not update community member" });
      }
    },
  );

  app.get(
    "/api/communities/:id/moderation-actions",
    attachUser,
    async (req, res) => {
      try {
        const communityId = Number(req.params.id);
        if (
          !Number.isInteger(communityId) ||
          !(await storage.getCommunityById(communityId))
        )
          return res.status(404).json({ message: "Community not found" });
        const membership = await storage.getCommunityMembership(
          req.dbUser!.id,
          communityId,
        );
        if (!membership || !["owner", "admin"].includes(membership.role))
          return res.status(403).json({
            message: "Only community managers can view moderation history",
          });
        res.json(
          await db
            .select()
            .from(communityModerationActions)
            .where(eq(communityModerationActions.communityId, communityId))
            .orderBy(desc(communityModerationActions.createdAt))
            .limit(100),
        );
      } catch {
        res.status(500).json({ message: "Could not load moderation history" });
      }
    },
  );

  app.post("/api/communities/:id/join", attachUser, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const community = await storage.getCommunityById(communityId);
      if (!community)
        return res.status(404).json({ message: "Community not found" });
      const [existing] = await db
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.userId, req.dbUser!.id),
            eq(communityMemberships.communityId, communityId),
          ),
        )
        .limit(1);
      if (existing?.status === "banned")
        return res
          .status(403)
          .json({ message: "You cannot join this community" });
      if (existing) return res.json(existing);
      if (process.env.CREATOROS_DEMO_MODE !== "true") {
        const [accessOffer] = await db.select({ id: products.id })
          .from(products)
          .where(and(
            eq(products.communityId, communityId),
            eq(products.status, "published"),
            inArray(products.productType, ["community", "membership"]),
          ))
          .limit(1);
        if (accessOffer) {
          const [access] = await db.select({ id: entitlements.id })
            .from(entitlements)
            .where(and(
              eq(entitlements.userId, req.dbUser!.id),
              eq(entitlements.productId, accessOffer.id),
              eq(entitlements.status, "active"),
            ))
            .limit(1);
          if (!access) {
            return res.status(402).json({
              message: "Purchase this membership before joining its community",
              productId: accessOffer.id,
            });
          }
        }
      }
      const membership = await storage.joinCommunity({
        userId: req.dbUser!.id,
        communityId,
        role: "member",
      });
      res.status(201).json(membership);
    } catch (error) {
      res.status(500).json({ message: "Failed to join community" });
    }
  });

  app.delete(
    "/api/communities/:id/membership",
    attachUser,
    async (req, res) => {
      try {
        const communityId = Number(req.params.id);
        if (
          !Number.isInteger(communityId) ||
          !(await storage.getCommunityById(communityId))
        )
          return res.status(404).json({ message: "Community not found" });
        const membership = Number.isInteger(communityId)
          ? await storage.getCommunityMembership(req.dbUser!.id, communityId)
          : undefined;
        if (!membership)
          return res
            .status(404)
            .json({ message: "Community membership not found" });
        if (membership.role === "owner")
          return res.status(409).json({
            message: "Transfer ownership before leaving this community",
          });
        await db
          .delete(communityMemberships)
          .where(eq(communityMemberships.id, membership.id));
        res.status(204).send();
      } catch {
        res.status(500).json({ message: "Could not leave community" });
      }
    },
  );

  app.post("/api/communities/:id/archive", attachUser, async (req, res) => {
    try {
      const communityId = Number(req.params.id);
      if (!Number.isInteger(communityId))
        return res.status(400).json({ message: "Invalid community" });
      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        communityId,
      );
      if (!membership || membership.role !== "owner")
        return res.status(403).json({
          message: "Only the community owner can archive this community",
        });
      const community = await storage.archiveCommunity(communityId);
      if (!community)
        return res.status(404).json({ message: "Community not found" });
      await db
        .update(communityRooms)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(
          and(
            eq(communityRooms.communityId, communityId),
            inArray(communityRooms.status, ["scheduled", "live"]),
          ),
        );
      void emitProjectionEvent({
        aggregateType: "community",
        aggregateId: String(communityId),
        eventType: "community.archived",
        actorUserId: req.dbUser!.id,
        payload: { archivedAt: community.archivedAt?.toISOString() ?? null },
        idempotencyKey: `community.archived:${communityId}`,
      }).catch((error) =>
        console.error("Failed to enqueue community archive projection:", error),
      );
      res.json(community);
    } catch {
      res.status(500).json({ message: "Could not archive community" });
    }
  });

  // Rooms stay usable locally. UMH receives lifecycle events through the
  // outbox, but neither UMH nor a media provider is in the request path.
  type RoomAccess =
    | {
        ok: true;
        room: typeof communityRooms.$inferSelect;
        membership: typeof communityMemberships.$inferSelect;
        canManage: boolean;
      }
    | { ok: false; status: 403 | 404; message: string };
  const roomAccess = async (
    roomId: string,
    userId: number,
  ): Promise<RoomAccess> => {
    const [room] = await db
      .select()
      .from(communityRooms)
      .where(eq(communityRooms.id, roomId))
      .limit(1);
    if (!room)
      return { ok: false, status: 404 as const, message: "Room not found" };
    if (!(await storage.getCommunityById(room.communityId)))
      return {
        ok: false,
        status: 404 as const,
        message: "Community not found",
      };
    const [membership] = await db
      .select()
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, room.communityId),
          eq(communityMemberships.userId, userId),
          ne(communityMemberships.status, "banned"),
        ),
      )
      .limit(1);
    if (!membership)
      return {
        ok: false,
        status: 403 as const,
        message: "Join this community to access its rooms",
      };
    return {
      ok: true,
      room,
      membership,
      canManage:
        room.hostUserId === userId ||
        ["owner", "admin"].includes(membership.role),
    };
  };

  const roomIntelligencePolicy = async (roomId: string) => {
    const [policy] = await db
      .select()
      .from(communityRoomIntelligencePolicies)
      .where(eq(communityRoomIntelligencePolicies.roomId, roomId))
      .limit(1);
    return policy ?? null;
  };

  const effectiveRoomIntelligencePolicy = async (roomId: string) => {
    const stored = await roomIntelligencePolicy(roomId);
    return {
      ...defaultRoomIntelligencePolicy,
      ...(stored ?? {}),
      id: stored?.id ?? null,
      roomId,
      configured: Boolean(stored),
      updatedAt: stored?.updatedAt ?? null,
    };
  };

  const participantConsentCoverage = async (
    room: typeof communityRooms.$inferSelect,
    capability: "recording" | "transcription" | "ai_analysis",
  ) => {
    const configuration = getLiveKitConfiguration();
    if (!configuration)
      return {
        ok: false as const,
        status: 503 as const,
        message: "Native community rooms are not configured yet",
      };
    const participantState = await getLiveKitRoomParticipantState(
      configuration,
      liveKitRoomName(room.communityId, room.id),
    );
    const participantUserIds = participantState.userIds;
    if (!participantUserIds.length)
      return {
        ok: false as const,
        status: 409 as const,
        message: "At least one participant must be in the room first",
      };
    const granted = await db
      .select({ userId: communityRoomConsents.userId })
      .from(communityRoomConsents)
      .where(
        and(
          eq(communityRoomConsents.roomId, room.id),
          eq(communityRoomConsents.capability, capability),
          eq(communityRoomConsents.decision, "granted"),
          inArray(communityRoomConsents.userId, participantUserIds),
        ),
      );
    const missingUserIds = missingParticipantConsentUserIds(
      participantUserIds,
      granted.map((row) => row.userId),
    );
    if (missingUserIds.length)
      return {
        ok: false as const,
        status: 409 as const,
        code: "PARTICIPANT_CONSENT_REQUIRED",
        message:
          "Every current participant must grant this room permission before it starts",
        missingUserIds,
      };
    return {
      ok: true as const,
      participantUserIds,
      hasPublishedMedia: participantState.hasPublishedMedia,
    };
  };

  const stopRoomMediaBeforeClose = async (
    room: typeof communityRooms.$inferSelect,
  ) => {
    const [recording, agentSessions] = await Promise.all([
      db
        .select()
        .from(communityRoomRecordings)
        .where(
          and(
            eq(communityRoomRecordings.roomId, room.id),
            inArray(communityRoomRecordings.status, [
              "starting",
              "active",
              "stopping",
            ]),
          ),
        )
        .orderBy(desc(communityRoomRecordings.createdAt))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select()
        .from(communityRoomAgentSessions)
        .where(
          and(
            eq(communityRoomAgentSessions.roomId, room.id),
            inArray(communityRoomAgentSessions.status, ["starting", "active"]),
          ),
        ),
    ]);
    if (!recording && !agentSessions.length) return;
    const configuration = getLiveKitConfiguration();
    if (!configuration)
      throw new Error("Native room provider is unavailable while media is active");
    if (recording?.providerRecordingId) {
      const stopped = await stopLiveKitRoomRecording(
        configuration,
        recording.providerRecordingId,
      );
      await db
        .update(communityRoomRecordings)
        .set({ ...liveKitRecordingResult(stopped), updatedAt: new Date() })
        .where(eq(communityRoomRecordings.id, recording.id));
    }
    for (const session of agentSessions) {
      if (!session.providerSessionId)
        throw new Error("A room service is still starting");
      await stopLiveKitRoomAgent(configuration, {
        roomName: liveKitRoomName(room.communityId, room.id),
        providerSessionId: session.providerSessionId,
      });
      const now = new Date();
      await db
        .update(communityRoomAgentSessions)
        .set({ status: "stopped", stoppedAt: now, updatedAt: now })
        .where(eq(communityRoomAgentSessions.id, session.id));
    }
  };

  const stopRoomCapability = async (
    room: typeof communityRooms.$inferSelect,
    capability: "recording" | "transcription" | "ai_analysis",
  ) => {
    const configuration = getLiveKitConfiguration();
    if (!configuration)
      throw new Error("Native room provider is unavailable");
    if (capability === "recording") {
      const [recording] = await db
        .select()
        .from(communityRoomRecordings)
        .where(
          and(
            eq(communityRoomRecordings.roomId, room.id),
            inArray(communityRoomRecordings.status, [
              "starting",
              "active",
              "stopping",
            ]),
          ),
        )
        .orderBy(desc(communityRoomRecordings.createdAt))
        .limit(1);
      if (recording?.providerRecordingId) {
        const stopped = await stopLiveKitRoomRecording(
          configuration,
          recording.providerRecordingId,
        );
        await db
          .update(communityRoomRecordings)
          .set({ ...liveKitRecordingResult(stopped), updatedAt: new Date() })
          .where(eq(communityRoomRecordings.id, recording.id));
      }
      await db
        .update(communityRooms)
        .set({ recordingEnabled: false, updatedAt: new Date() })
        .where(eq(communityRooms.id, room.id));
      return;
    }
    const kind = capability === "transcription" ? "transcription" : "realtime_ai";
    const sessions = await db
      .select()
      .from(communityRoomAgentSessions)
      .where(
        and(
          eq(communityRoomAgentSessions.roomId, room.id),
          eq(communityRoomAgentSessions.kind, kind),
          inArray(communityRoomAgentSessions.status, ["starting", "active"]),
        ),
      );
    for (const session of sessions) {
      if (!session.providerSessionId)
        throw new Error("A room service is still starting");
      await stopLiveKitRoomAgent(configuration, {
        roomName: liveKitRoomName(room.communityId, room.id),
        providerSessionId: session.providerSessionId,
      });
      const now = new Date();
      await db
        .update(communityRoomAgentSessions)
        .set({ status: "stopped", stoppedAt: now, updatedAt: now })
        .where(eq(communityRoomAgentSessions.id, session.id));
    }
    await db
      .update(communityRooms)
      .set({
        ...(capability === "transcription"
          ? { transcriptionEnabled: false }
          : { aiAssistanceEnabled: false }),
        updatedAt: new Date(),
      })
      .where(eq(communityRooms.id, room.id));
  };

  app.get("/api/community-room-providers", attachUser, (_req, res) => {
    res.json({ livekit: liveKitProviderStatus() });
  });

  app.get("/api/communities/:id/rooms", attachUser, async (req, res) => {
    try {
      const communityId = Number(req.params.id);
      if (!Number.isInteger(communityId))
        return res.status(400).json({ message: "Invalid community" });
      if (!(await storage.getCommunityById(communityId)))
        return res.status(404).json({ message: "Community not found" });
      const [membership] = await db
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.userId, req.dbUser!.id),
            ne(communityMemberships.status, "banned"),
          ),
        )
        .limit(1);
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community to view its rooms" });
      const rooms = await db
        .select()
        .from(communityRooms)
        .where(eq(communityRooms.communityId, communityId))
        .orderBy(communityRooms.startsAt);
      if (!rooms.length) return res.json([]);
      const roomIds = rooms.map((room) => room.id);
      const [counts, currentAttendance] = await Promise.all([
        db
          .select({
            roomId: communityRoomAttendees.roomId,
            goingCount: count(communityRoomAttendees.id),
            checkedInCount: sql<number>`count(${communityRoomAttendees.checkedInAt})`,
          })
          .from(communityRoomAttendees)
          .where(
            and(
              inArray(communityRoomAttendees.roomId, roomIds),
              eq(communityRoomAttendees.status, "going"),
            ),
          )
          .groupBy(communityRoomAttendees.roomId),
        db
          .select({
            roomId: communityRoomAttendees.roomId,
            status: communityRoomAttendees.status,
            checkedInAt: communityRoomAttendees.checkedInAt,
          })
          .from(communityRoomAttendees)
          .where(
            and(
              inArray(communityRoomAttendees.roomId, roomIds),
              eq(communityRoomAttendees.userId, req.dbUser!.id),
            ),
          ),
      ]);
      const countsByRoom = new Map(
        counts.map((row) => [
          row.roomId,
          {
            goingCount: Number(row.goingCount),
            checkedInCount: Number(row.checkedInCount),
          },
        ]),
      );
      const attendanceByRoom = new Map(
        currentAttendance.map((row) => [row.roomId, row]),
      );
      res.json(
        rooms.map((room) => ({
          ...room,
          goingCount: countsByRoom.get(room.id)?.goingCount ?? 0,
          checkedInCount: countsByRoom.get(room.id)?.checkedInCount ?? 0,
          rsvpStatus: attendanceByRoom.get(room.id)?.status ?? null,
          checkedInAt: attendanceByRoom.get(room.id)?.checkedInAt ?? null,
        })),
      );
    } catch {
      res.status(500).json({ message: "Could not load community rooms" });
    }
  });

  app.post("/api/communities/:id/rooms", attachUser, async (req, res) => {
    try {
      const communityId = Number(req.params.id);
      if (
        !Number.isInteger(communityId) ||
        !(await storage.getCommunityById(communityId))
      )
        return res.status(404).json({ message: "Community not found" });
      const [membership] = Number.isInteger(communityId)
        ? await db
            .select()
            .from(communityMemberships)
            .where(
              and(
                eq(communityMemberships.communityId, communityId),
                eq(communityMemberships.userId, req.dbUser!.id),
                ne(communityMemberships.status, "banned"),
              ),
            )
            .limit(1)
        : [];
      if (!membership || !["owner", "admin"].includes(membership.role))
        return res
          .status(403)
          .json({ message: "Only community managers can schedule rooms" });
      if (!canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const title =
        typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const description =
        typeof req.body?.description === "string"
          ? req.body.description.trim()
          : "";
      const startsAt = parseRoomDate(req.body?.startsAt);
      const provider =
        typeof req.body?.provider === "string"
          ? req.body.provider
          : "manual_link";
      const joinUrl = parseRoomUrl(req.body?.joinUrl);
      const channelId = Number.isInteger(Number(req.body?.channelId))
        ? Number(req.body.channelId)
        : null;
      if (
        !title ||
        title.length > 160 ||
        description.length > 10_000 ||
        !startsAt ||
        !communityRoomProviders.has(provider) ||
        joinUrl === undefined
      )
        return res.status(400).json({
          message: "Provide a valid title, schedule, provider, and room link",
        });
      if (channelId !== null) {
        const [channel] = await db
          .select()
          .from(channels)
          .where(
            and(
              eq(channels.id, channelId),
              eq(channels.communityId, communityId),
            ),
          )
          .limit(1);
        if (!channel)
          return res
            .status(400)
            .json({ message: "The selected channel is not in this community" });
      }
      const [room] = await db
        .insert(communityRooms)
        .values({
          communityId,
          channelId,
          hostUserId: req.dbUser!.id,
          title,
          description,
          startsAt,
          provider,
          joinUrl,
        })
        .returning();
      void emitProjectionEvent({
        aggregateType: "community_room",
        aggregateId: room.id,
        eventType: "community.room.scheduled",
        actorUserId: req.dbUser!.id,
        payload: {
          communityId,
          provider,
          startsAt: room.startsAt.toISOString(),
          recordingConsentRequired: room.recordingConsentRequired,
        },
        idempotencyKey: `community.room.scheduled:${room.id}`,
      }).catch((error) =>
        console.error("Failed to enqueue community room projection:", error),
      );
      res.status(201).json(room);
    } catch {
      res.status(500).json({ message: "Could not schedule community room" });
    }
  });

  app.get("/api/community-rooms/:id", attachUser, async (req, res) => {
    const access = await roomAccess(req.params.id, req.dbUser!.id);
    if (!access.ok)
      return res.status(access.status).json({ message: access.message });
    res.json({ ...access.room, canManage: access.canManage });
  });

  app.get("/api/community-rooms/:id/media", attachUser, async (req, res) => {
    try {
      const access = await roomAccess(req.params.id, req.dbUser!.id);
      if (!access.ok)
        return res.status(access.status).json({ message: access.message });
      const [recordings, transcriptSegments, agentSessions, policy, profiles] =
        await Promise.all([
          db
            .select()
            .from(communityRoomRecordings)
            .where(eq(communityRoomRecordings.roomId, access.room.id))
            .orderBy(desc(communityRoomRecordings.createdAt))
            .limit(25),
          db
            .select()
            .from(communityRoomTranscriptSegments)
            .where(
              and(
                eq(communityRoomTranscriptSegments.roomId, access.room.id),
                eq(communityRoomTranscriptSegments.isFinal, true),
              ),
            )
            .orderBy(asc(communityRoomTranscriptSegments.createdAt))
            .limit(1_000),
          db
            .select()
            .from(communityRoomAgentSessions)
            .where(eq(communityRoomAgentSessions.roomId, access.room.id))
            .orderBy(desc(communityRoomAgentSessions.createdAt))
            .limit(50),
          effectiveRoomIntelligencePolicy(access.room.id),
          db
            .select()
            .from(communityRoomAiProfiles)
            .where(
              and(
                eq(communityRoomAiProfiles.roomId, access.room.id),
                ne(communityRoomAiProfiles.status, "removed"),
              ),
            )
            .orderBy(communityRoomAiProfiles.createdAt),
        ]);
      if (recordings[0]) recordings[0] = await reconcileRoomRecording(recordings[0]);
      const provider = liveKitProviderStatus();
      res.json({
        canManage: access.canManage,
        roomStatus: access.room.status,
        recordingEnabled: access.room.recordingEnabled,
        transcriptionEnabled: access.room.transcriptionEnabled,
        aiAssistanceEnabled: access.room.aiAssistanceEnabled,
        policy,
        provider: {
          ...provider,
          transcriptIngestConfigured: Boolean(
            configuredRoomMediaIngestSecret(
              process.env.ROOM_MEDIA_INGEST_SECRET,
            ),
          ),
        },
        recordings,
        transcriptSegments,
        agentSessions,
        aiProfiles: profiles.filter(
          (profile) =>
            access.canManage ||
            canAccessRoomAiProfile(
              access.membership.role,
              profile.audienceRole,
            ),
        ),
      });
    } catch (error) {
      console.error("Could not load room media:", error);
      res.status(500).json({ message: "Could not load room media" });
    }
  });

  app.post(
    "/api/community-rooms/:id/media/recordings/start",
    attachUser,
    async (req, res) => {
      let recordingId: string | null = null;
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can record this room",
          });
        if (access.room.provider !== "livekit" || access.room.status !== "live")
          return res.status(409).json({
            message: "Recording is available only while a native room is live",
          });
        const policy = await effectiveRoomIntelligencePolicy(access.room.id);
        if (!policy.recordingAllowed)
          return res.status(409).json({
            message: "Enable recording in the room policy before the room starts",
          });
        const configuration = getLiveKitRecordingConfiguration();
        if (!configuration)
          return res.status(503).json({
            message: "Private room recording storage is not configured",
          });
        const coverage = await participantConsentCoverage(
          access.room,
          "recording",
        );
        if (!coverage.ok)
          return res.status(coverage.status).json({
            code: "code" in coverage ? coverage.code : undefined,
            message: coverage.message,
            missingUserIds:
              "missingUserIds" in coverage ? coverage.missingUserIds : undefined,
          });
        if (!coverage.hasPublishedMedia)
          return res.status(409).json({
            code: "ROOM_MEDIA_REQUIRED",
            message:
              "Turn on a microphone or camera, or share a screen, before recording",
          });
        recordingId = crypto.randomUUID();
        const storageKey = liveKitRecordingStorageKey(
          access.room.id,
          recordingId,
        );
        const [recording] = await db
          .insert(communityRoomRecordings)
          .values({
            id: recordingId,
            roomId: access.room.id,
            requestedByUserId: req.dbUser!.id,
            storageKey,
          })
          .returning();
        const providerRecording = await startLiveKitRoomRecording(configuration, {
          roomName: liveKitRoomName(
            access.room.communityId,
            access.room.id,
          ),
          storageKey,
        });
        const result = liveKitRecordingResult(providerRecording);
        const [activeRecording] = await db
          .update(communityRoomRecordings)
          .set({ ...result, updatedAt: new Date() })
          .where(eq(communityRoomRecordings.id, recording.id))
          .returning();
        await db
          .update(communityRooms)
          .set({ recordingEnabled: true, updatedAt: new Date() })
          .where(eq(communityRooms.id, access.room.id));
        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: access.room.id,
          eventType: "community.room.recording.started",
          actorUserId: req.dbUser!.id,
          payload: { communityId: access.room.communityId, recordingId },
          idempotencyKey: `community.room.recording.started:${recordingId}`,
        }).catch((error) =>
          console.error("Failed to enqueue recording event:", error),
        );
        res.status(201).json(activeRecording);
      } catch (error) {
        console.error("Could not start room recording:", error);
        if (recordingId)
          await db
            .update(communityRoomRecordings)
            .set({
              status: "failed",
              errorMessage:
                error instanceof Error ? error.message.slice(0, 2_000) : "Provider failure",
              updatedAt: new Date(),
            })
            .where(eq(communityRoomRecordings.id, recordingId))
            .catch(() => undefined);
        res.status(502).json({
          message:
            "The recording provider could not start. No recording is active.",
        });
      }
    },
  );

  app.post(
    "/api/community-rooms/:id/media/recordings/stop",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can stop recording",
          });
        const [recording] = await db
          .select()
          .from(communityRoomRecordings)
          .where(
            and(
              eq(communityRoomRecordings.roomId, access.room.id),
              inArray(communityRoomRecordings.status, [
                "starting",
                "active",
                "stopping",
              ]),
            ),
          )
          .orderBy(desc(communityRoomRecordings.createdAt))
          .limit(1);
        if (!recording?.providerRecordingId)
          return res.status(409).json({ message: "No recording is active" });
        const configuration = getLiveKitConfiguration();
        if (!configuration)
          return res.status(503).json({
            message: "Native community rooms are not configured yet",
          });
        await db
          .update(communityRoomRecordings)
          .set({ status: "stopping", updatedAt: new Date() })
          .where(eq(communityRoomRecordings.id, recording.id));
        const providerRecording = await stopLiveKitRoomRecording(
          configuration,
          recording.providerRecordingId,
        );
        const result = liveKitRecordingResult(providerRecording);
        const [stoppedRecording] = await db
          .update(communityRoomRecordings)
          .set({ ...result, updatedAt: new Date() })
          .where(eq(communityRoomRecordings.id, recording.id))
          .returning();
        await db
          .update(communityRooms)
          .set({ recordingEnabled: false, updatedAt: new Date() })
          .where(eq(communityRooms.id, access.room.id));
        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: access.room.id,
          eventType: "community.room.recording.stop_requested",
          actorUserId: req.dbUser!.id,
          payload: {
            communityId: access.room.communityId,
            recordingId: recording.id,
            status: stoppedRecording.status,
          },
          idempotencyKey: `community.room.recording.stop_requested:${recording.id}`,
        }).catch((error) =>
          console.error("Failed to enqueue recording stop event:", error),
        );
        res.json(stoppedRecording);
      } catch (error) {
        console.error("Could not stop room recording:", error);
        res.status(502).json({
          message: "The recording provider did not confirm the stop request",
        });
      }
    },
  );

  app.get(
    "/api/community-rooms/:id/media/recordings/:recordingId/download",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        const [recording] = await db
          .select()
          .from(communityRoomRecordings)
          .where(
            and(
              eq(communityRoomRecordings.id, req.params.recordingId),
              eq(communityRoomRecordings.roomId, access.room.id),
            ),
          )
          .limit(1);
        if (!recording)
          return res.status(404).json({ message: "Recording not found" });
        const reconciled = await reconcileRoomRecording(recording);
        if (reconciled.status !== "complete")
          return res.status(409).json({
            message: "This recording is not ready to download yet",
          });
        res.json(await createPrivateAssetReadUrl(reconciled.storageKey));
      } catch (error) {
        console.error("Could not create recording download:", error);
        res.status(500).json({ message: "Could not open this recording" });
      }
    },
  );

  app.post(
    "/api/community-rooms/:id/media/agents/start",
    attachUser,
    async (req, res) => {
      let sessionId: string | null = null;
      let relationshipUsageBusinessId: string | null = null;
      let relationshipReservedMinutes = 0;
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can start room AI",
          });
        if (access.room.provider !== "livekit" || access.room.status !== "live")
          return res.status(409).json({
            message: "Realtime room services can start only in a live native room",
          });
        const kind =
          req.body?.kind === "transcription" || req.body?.kind === "realtime_ai"
            ? req.body.kind
            : null;
        if (!kind)
          return res.status(400).json({ message: "Choose a valid room service" });
        const configuration = getLiveKitConfiguration();
        const agentName = getLiveKitAgentName(kind);
        if (!configuration || !agentName)
          return res.status(503).json({
            message:
              kind === "transcription"
                ? "The transcription agent runtime is not configured"
                : "The realtime AI participant runtime is not configured",
          });
        const policy = await effectiveRoomIntelligencePolicy(access.room.id);
        const capability =
          kind === "transcription" ? "transcription" : "ai_analysis";
        if (
          (kind === "transcription" && !policy.transcriptionAllowed) ||
          (kind === "realtime_ai" && !policy.aiAnalysisAllowed)
        )
          return res.status(409).json({
            message: "Enable this capability in the room policy before the room starts",
          });
        let profile: typeof communityRoomAiProfiles.$inferSelect | null = null;
        let boundRelationshipContext: Awaited<ReturnType<typeof relationshipRoomContext>> = null;
        if (kind === "realtime_ai") {
          const profileId =
            typeof req.body?.profileId === "string" ? req.body.profileId : "";
          [profile] = await db
            .select()
            .from(communityRoomAiProfiles)
            .where(
              and(
                eq(communityRoomAiProfiles.id, profileId),
                eq(communityRoomAiProfiles.roomId, access.room.id),
                eq(communityRoomAiProfiles.status, "configured"),
              ),
            )
            .limit(1);
          if (!profile)
            return res.status(404).json({ message: "AI room role not found" });
          if (
            (profile.mode === "private_copilot" &&
              !policy.privateCopilotEnabled) ||
            (profile.mode === "visible_participant" && !policy.visibleAiEnabled)
          )
            return res.status(409).json({
              message: "That AI mode is not enabled by the room policy",
            });
          boundRelationshipContext = await relationshipRoomContext(access.room.id);
          relationshipUsageBusinessId = boundRelationshipContext?.businessId ?? null;
        }
        const coverage = await participantConsentCoverage(
          access.room,
          capability,
        );
        if (!coverage.ok)
          return res.status(coverage.status).json({
            code: "code" in coverage ? coverage.code : undefined,
            message: coverage.message,
            missingUserIds:
              "missingUserIds" in coverage ? coverage.missingUserIds : undefined,
          });
        const [existing] = await db
          .select()
          .from(communityRoomAgentSessions)
          .where(
            and(
              eq(communityRoomAgentSessions.roomId, access.room.id),
              eq(communityRoomAgentSessions.kind, kind),
              profile
                ? eq(communityRoomAgentSessions.agentProfileId, profile.id)
                : isNull(communityRoomAgentSessions.agentProfileId),
              inArray(communityRoomAgentSessions.status, [
                "starting",
                "active",
              ]),
            ),
          )
          .limit(1);
        if (existing)
          return res.status(409).json({ message: "That room service is already active" });
        sessionId = crypto.randomUUID();
        if (relationshipUsageBusinessId) {
          const operations = await relationshipOperationsSnapshot(relationshipUsageBusinessId);
          const realtime = operations.capacity["realtime.minute"];
          const remaining = realtime.limit < 0 ? 60 : realtime.limit - realtime.used - realtime.reserved;
          relationshipReservedMinutes = Math.max(1, Math.min(60, remaining));
          await reserveRelationshipUsage({
            businessId: relationshipUsageBusinessId,
            metric: "realtime.minute",
            quantity: relationshipReservedMinutes,
            sourceType: "community_room_agent_session",
            sourceId: sessionId,
            idempotencyKey: `realtime.minute:${sessionId}`,
            expiresInMs: 24 * 60 * 60_000,
          });
        }
        const [session] = await db
          .insert(communityRoomAgentSessions)
          .values({
            id: sessionId,
            roomId: access.room.id,
            agentProfileId: profile?.id ?? null,
            startedByUserId: req.dbUser!.id,
            kind,
          })
          .returning();
        const dispatch = await dispatchLiveKitRoomAgent(configuration, {
          roomName: liveKitRoomName(
            access.room.communityId,
            access.room.id,
          ),
          agentName,
          metadata: {
            protocol: "creativesos.room-agent.v1",
            roomId: access.room.id,
            communityId: access.room.communityId,
            sessionId,
            kind,
            retentionDays: policy.retentionDays,
            transcriptIngestUrl: `${(process.env.PUBLIC_APP_URL ?? "https://creativesos.net").replace(/\/$/, "")}/api/community-room-media/transcripts`,
            profile: profile
              ? {
                  id: profile.id,
                  name: profile.name,
                  role: profile.role,
                  mode: profile.mode,
                  audienceRole: profile.audienceRole,
                  instructions: profile.instructions,
                }
              : null,
            relationshipContext: boundRelationshipContext,
            relationshipUsage: relationshipUsageBusinessId ? {
              reservationKey: `realtime.minute:${sessionId}`,
              maxMinutes: relationshipReservedMinutes,
              enforcement: "stop_before_limit",
            } : null,
          },
        });
        const [activeSession] = await db
          .update(communityRoomAgentSessions)
          .set({
            providerSessionId: dispatch.id,
            status: "active",
            startedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(communityRoomAgentSessions.id, session.id))
          .returning();
        await db
          .update(communityRooms)
          .set({
            ...(kind === "transcription"
              ? { transcriptionEnabled: true }
              : { aiAssistanceEnabled: true }),
            updatedAt: new Date(),
          })
          .where(eq(communityRooms.id, access.room.id));
        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: access.room.id,
          eventType: `community.room.${kind}.started`,
          actorUserId: req.dbUser!.id,
          payload: {
            communityId: access.room.communityId,
            sessionId,
            profileId: profile?.id ?? null,
          },
          idempotencyKey: `community.room.${kind}.started:${sessionId}`,
        }).catch((error) =>
          console.error("Failed to enqueue room agent event:", error),
        );
        res.status(201).json(activeSession);
      } catch (error) {
        console.error("Could not start room agent:", error);
        if (sessionId && relationshipUsageBusinessId)
          await releaseRelationshipUsage({ businessId: relationshipUsageBusinessId, idempotencyKey: `realtime.minute:${sessionId}` }).catch(() => undefined);
        if (sessionId)
          await db
            .update(communityRoomAgentSessions)
            .set({
              status: "failed",
              errorMessage:
                error instanceof Error ? error.message.slice(0, 2_000) : "Provider failure",
              updatedAt: new Date(),
            })
            .where(eq(communityRoomAgentSessions.id, sessionId))
            .catch(() => undefined);
        if (error instanceof RelationshipQuotaError)
          return res.status(409).json({ code: error.code, message: error.message });
        res.status(502).json({ message: "The room agent runtime could not start" });
      }
    },
  );

  app.post(
    "/api/community-rooms/:id/media/agents/:sessionId/stop",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can stop room AI",
          });
        const [session] = await db
          .select()
          .from(communityRoomAgentSessions)
          .where(
            and(
              eq(communityRoomAgentSessions.id, req.params.sessionId),
              eq(communityRoomAgentSessions.roomId, access.room.id),
              inArray(communityRoomAgentSessions.status, ["starting", "active"]),
            ),
          )
          .limit(1);
        if (!session?.providerSessionId)
          return res.status(404).json({ message: "Active room service not found" });
        const configuration = getLiveKitConfiguration();
        if (!configuration)
          return res.status(503).json({
            message: "Native community rooms are not configured yet",
          });
        await stopLiveKitRoomAgent(configuration, {
          roomName: liveKitRoomName(
            access.room.communityId,
            access.room.id,
          ),
          providerSessionId: session.providerSessionId,
        });
        const now = new Date();
        const [stopped] = await db
          .update(communityRoomAgentSessions)
          .set({ status: "stopped", stoppedAt: now, updatedAt: now })
          .where(eq(communityRoomAgentSessions.id, session.id))
          .returning();
        if (session.kind === "realtime_ai" && session.startedAt) {
          const context = await relationshipRoomContext(access.room.id);
          if (context) await finalizeRelationshipUsage({
            businessId: context.businessId,
            quantity: Math.max(1, Math.ceil((now.getTime() - session.startedAt.getTime()) / 60_000)),
            provider: "livekit_agents",
            idempotencyKey: `realtime.minute:${session.id}`,
            occurredAt: now,
            metadata: { roomId: access.room.id, relationshipId: context.relationship.id, profileId: session.agentProfileId },
          }).catch((error) => console.error("Could not finalize relationship realtime usage", { errorType: error instanceof Error ? error.name : typeof error }));
        }
        const [otherActive] = await db
          .select({ count: count(communityRoomAgentSessions.id) })
          .from(communityRoomAgentSessions)
          .where(
            and(
              eq(communityRoomAgentSessions.roomId, access.room.id),
              eq(communityRoomAgentSessions.kind, session.kind),
              ne(communityRoomAgentSessions.id, session.id),
              inArray(communityRoomAgentSessions.status, ["starting", "active"]),
            ),
          );
        if (Number(otherActive?.count ?? 0) === 0)
          await db
            .update(communityRooms)
            .set({
              ...(session.kind === "transcription"
                ? { transcriptionEnabled: false }
                : { aiAssistanceEnabled: false }),
              updatedAt: now,
            })
            .where(eq(communityRooms.id, access.room.id));
        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: access.room.id,
          eventType: `community.room.${session.kind}.stopped`,
          actorUserId: req.dbUser!.id,
          payload: {
            communityId: access.room.communityId,
            sessionId: session.id,
            profileId: session.agentProfileId,
          },
          idempotencyKey: `community.room.${session.kind}.stopped:${session.id}`,
        }).catch((error) =>
          console.error("Failed to enqueue room agent stop event:", error),
        );
        res.json(stopped);
      } catch (error) {
        console.error("Could not stop room agent:", error);
        res.status(502).json({
          message: "The room agent runtime did not confirm the stop request",
        });
      }
    },
  );

  app.post("/api/community-room-media/transcripts", async (req, res) => {
    try {
      const rawBody = req.rawBody;
      if (
        !rawBody ||
        !verifyRoomMediaIngest({
          secret: process.env.ROOM_MEDIA_INGEST_SECRET,
          timestamp: req.header("x-creativesos-room-timestamp") ?? undefined,
          signature: req.header("x-creativesos-room-signature") ?? undefined,
          rawBody,
        })
      )
        return res.status(401).json({ message: "Invalid room media signature" });
      const parsed = roomTranscriptSegmentInputSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Invalid transcript segment" });
      const [room] = await db
        .select({ id: communityRooms.id })
        .from(communityRooms)
        .where(eq(communityRooms.id, parsed.data.roomId))
        .limit(1);
      if (!room) return res.status(404).json({ message: "Room not found" });
      const transcriptGraceCutoff = new Date(Date.now() - 5 * 60 * 1_000);
      const [transcriptionSession] = await db
        .select({ id: communityRoomAgentSessions.id })
        .from(communityRoomAgentSessions)
        .where(
          and(
            eq(communityRoomAgentSessions.id, parsed.data.sessionId),
            eq(communityRoomAgentSessions.roomId, room.id),
            eq(communityRoomAgentSessions.kind, "transcription"),
            or(
              eq(communityRoomAgentSessions.status, "starting"),
              eq(communityRoomAgentSessions.status, "active"),
              and(
                eq(communityRoomAgentSessions.status, "stopped"),
                gt(communityRoomAgentSessions.stoppedAt, transcriptGraceCutoff),
              ),
            ),
          ),
        )
        .limit(1);
      if (!transcriptionSession)
        return res.status(409).json({
          message: "This room has no authorized transcription session",
        });
      const speakerUserId = liveKitUserIdFromIdentity(
        parsed.data.speakerIdentity,
      );
      const now = new Date();
      const [segment] = await db
        .insert(communityRoomTranscriptSegments)
        .values({
          roomId: parsed.data.roomId,
          agentSessionId: transcriptionSession.id,
          providerSegmentId: parsed.data.providerSegmentId,
          speakerIdentity: parsed.data.speakerIdentity,
          speakerUserId,
          text: parsed.data.text,
          startTimeMs: parsed.data.startTimeMs ?? null,
          endTimeMs: parsed.data.endTimeMs ?? null,
          isFinal: true,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            communityRoomTranscriptSegments.agentSessionId,
            communityRoomTranscriptSegments.providerSegmentId,
          ],
          set: {
            text: parsed.data.text,
            startTimeMs: parsed.data.startTimeMs ?? null,
            endTimeMs: parsed.data.endTimeMs ?? null,
            isFinal: true,
            updatedAt: now,
          },
        })
        .returning();
      res.status(201).json({ id: segment.id });
    } catch (error) {
      console.error("Could not ingest room transcript:", error);
      res.status(500).json({ message: "Could not store transcript segment" });
    }
  });

  app.get(
    "/api/community-rooms/:id/intelligence",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        const policy = await effectiveRoomIntelligencePolicy(access.room.id);
        const [consents, profiles] = await Promise.all([
          db
            .select()
            .from(communityRoomConsents)
            .where(
              and(
                eq(communityRoomConsents.roomId, access.room.id),
                eq(communityRoomConsents.userId, req.dbUser!.id),
              ),
            )
            .orderBy(communityRoomConsents.capability),
          db
            .select()
            .from(communityRoomAiProfiles)
            .where(
              and(
                eq(communityRoomAiProfiles.roomId, access.room.id),
                ne(communityRoomAiProfiles.status, "removed"),
              ),
            )
            .orderBy(communityRoomAiProfiles.createdAt),
        ]);
        const accessibleProfiles = profiles.filter(
          (profile) =>
            access.canManage ||
            canAccessRoomAiProfile(
              access.membership.role,
              profile.audienceRole,
            ),
        );
        const profileIds = accessibleProfiles.map((profile) => profile.id);
        const insights =
          policy.privateCopilotEnabled && profileIds.length
            ? await db
                .select()
                .from(communityRoomInsights)
                .where(
                  and(
                    eq(communityRoomInsights.roomId, access.room.id),
                    inArray(communityRoomInsights.agentProfileId, profileIds),
                    or(
                      eq(
                        communityRoomInsights.targetUserId,
                        req.dbUser!.id,
                      ),
                      isNull(communityRoomInsights.targetUserId),
                    ),
                    eq(communityRoomInsights.status, "draft"),
                  ),
                )
                .orderBy(desc(communityRoomInsights.createdAt))
                .limit(50)
            : [];
        const allowedConsentCapabilities = [
          ...(policy.recordingAllowed ? ["recording"] : []),
          ...(policy.transcriptionAllowed ? ["transcription"] : []),
          ...(policy.aiAnalysisAllowed ? ["ai_analysis"] : []),
        ];
        res.json({
          policy,
          canManage: access.canManage,
          canViewGuestBriefs: canViewRoomGuestBriefs(
            access.membership.role,
            access.canManage,
            policy.guestBriefsEnabled,
          ),
          membershipRole: access.membership.role,
          allowedConsentCapabilities,
          activeConsentCapabilities: activeRoomConsentCapabilities(access.room),
          consents,
          aiProfiles: accessibleProfiles,
          insights,
          agentRuntime: {
            configured: Boolean(
              process.env.ROOM_AI_AGENT_DISPATCH_URL &&
                process.env.ROOM_AI_AGENT_SIGNING_SECRET,
            ),
            status:
              process.env.ROOM_AI_AGENT_DISPATCH_URL &&
              process.env.ROOM_AI_AGENT_SIGNING_SECRET
                ? "configured"
                : "provider_pending",
          },
        });
      } catch (error) {
        console.error("Could not load room intelligence:", error);
        res.status(500).json({ message: "Could not load room intelligence" });
      }
    },
  );

  app.put(
    "/api/community-rooms/:id/intelligence/policy",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can configure room intelligence",
          });
        if (!canContributeToCommunity(access.membership.status))
          return res.status(403).json({
            message: "Your community access is currently read-only",
          });
        if (access.room.status !== "scheduled")
          return res.status(409).json({
            message: "Room intelligence policy must be configured before the room starts",
          });
        const parsed = roomIntelligencePolicyInputSchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({
            message: "Provide valid room intelligence and retention settings",
          });
        const now = new Date();
        const [policy] = await db
          .insert(communityRoomIntelligencePolicies)
          .values({
            roomId: access.room.id,
            updatedByUserId: req.dbUser!.id,
            ...parsed.data,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: communityRoomIntelligencePolicies.roomId,
            set: {
              updatedByUserId: req.dbUser!.id,
              ...parsed.data,
              updatedAt: now,
            },
          })
          .returning();
        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: access.room.id,
          eventType: "community.room.intelligence_policy.updated",
          actorUserId: req.dbUser!.id,
          payload: {
            communityId: access.room.communityId,
            privateCopilotEnabled: policy.privateCopilotEnabled,
            visibleAiEnabled: policy.visibleAiEnabled,
          },
          idempotencyKey: `community.room.intelligence_policy.updated:${access.room.id}:${policy.updatedAt.toISOString()}`,
        }).catch((error) =>
          console.error("Failed to enqueue room intelligence policy event:", error),
        );
        res.json(policy);
      } catch (error) {
        console.error("Could not save room intelligence policy:", error);
        res.status(500).json({ message: "Could not save room intelligence policy" });
      }
    },
  );

  app.put(
    "/api/community-rooms/:id/intelligence/consent",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        const parsed = roomConsentInputSchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({ message: "Choose a valid consent decision" });
        const policy = await effectiveRoomIntelligencePolicy(access.room.id);
        if (!policyAllowsConsentCapability(policy, parsed.data.capability))
          return res.status(409).json({
            message: "That capability is not permitted by this room policy",
          });
        if (
          ["ended", "canceled"].includes(access.room.status) &&
          parsed.data.decision !== "withdrawn"
        )
          return res.status(409).json({
            message: "Consent can only be withdrawn after a room closes",
          });
        const now = new Date();
        const [consent] = await db
          .insert(communityRoomConsents)
          .values({
            roomId: access.room.id,
            userId: req.dbUser!.id,
            capability: parsed.data.capability,
            decision: parsed.data.decision,
            respondedAt: now,
            withdrawnAt:
              parsed.data.decision === "withdrawn" ? now : null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              communityRoomConsents.roomId,
              communityRoomConsents.userId,
              communityRoomConsents.capability,
            ],
            set: {
              decision: parsed.data.decision,
              respondedAt: now,
              withdrawnAt:
                parsed.data.decision === "withdrawn" ? now : null,
              updatedAt: now,
            },
          })
          .returning();
        if (
          parsed.data.decision !== "granted" &&
          activeRoomConsentCapabilities(access.room).includes(
            parsed.data.capability,
          )
        ) {
          try {
            await stopRoomCapability(access.room, parsed.data.capability);
          } catch (error) {
            console.error("Could not stop processing after consent withdrawal:", error);
            const configuration = getLiveKitConfiguration();
            if (configuration)
              await removeLiveKitRoomParticipant(configuration, {
                roomName: liveKitRoomName(
                  access.room.communityId,
                  access.room.id,
                ),
                userId: req.dbUser!.id,
              }).catch(() => undefined);
            return res.status(202).json({
              ...consent,
              processingStopPending: true,
              message:
                "Your permission was withdrawn and you were removed from active media while the provider stop is retried",
            });
          }
        }
        res.json(consent);
      } catch (error) {
        console.error("Could not save room consent:", error);
        res.status(500).json({ message: "Could not save room consent" });
      }
    },
  );

  app.post(
    "/api/community-rooms/:id/intelligence/ai-profiles",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can configure room AI",
          });
        if (!["scheduled", "live"].includes(access.room.status))
          return res.status(409).json({ message: "This room is already closed" });
        const parsed = roomAiProfileInputSchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({ message: "Provide a valid AI role and audience" });
        const policy = await effectiveRoomIntelligencePolicy(access.room.id);
        if (
          (parsed.data.mode === "private_copilot" &&
            !policy.privateCopilotEnabled) ||
          (parsed.data.mode === "visible_participant" &&
            !policy.visibleAiEnabled)
        )
          return res.status(409).json({
            message: "Enable that AI mode in the room policy first",
          });
        const [profile] = await db
          .insert(communityRoomAiProfiles)
          .values({
            roomId: access.room.id,
            createdByUserId: req.dbUser!.id,
            ...parsed.data,
          })
          .returning();
        res.status(201).json(profile);
      } catch (error) {
        console.error("Could not configure room AI:", error);
        res.status(500).json({ message: "Could not configure room AI" });
      }
    },
  );

  app.patch(
    "/api/community-rooms/:id/intelligence/ai-profiles/:profileId",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can manage room AI",
          });
        const parsed = roomAiProfileStatusInputSchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({ message: "Choose a valid AI profile status" });
        const [profile] = await db
          .update(communityRoomAiProfiles)
          .set({ status: parsed.data.status, updatedAt: new Date() })
          .where(
            and(
              eq(communityRoomAiProfiles.id, req.params.profileId),
              eq(communityRoomAiProfiles.roomId, access.room.id),
            ),
          )
          .returning();
        if (!profile)
          return res.status(404).json({ message: "AI profile not found" });
        res.json(profile);
      } catch (error) {
        console.error("Could not update room AI:", error);
        res.status(500).json({ message: "Could not update room AI" });
      }
    },
  );

  app.get(
    "/api/community-rooms/:id/intelligence/guest-briefs",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        const policy = await effectiveRoomIntelligencePolicy(access.room.id);
        if (
          !canViewRoomGuestBriefs(
            access.membership.role,
            access.canManage,
            policy.guestBriefsEnabled,
          )
        )
          return res.status(403).json({
            message: "Guest briefs are limited to authorized room roles",
          });
        const attendees = await db
          .select({
            userId: communityRoomAttendees.userId,
            status: communityRoomAttendees.status,
            checkedInAt: communityRoomAttendees.checkedInAt,
            displayName: users.displayName,
            username: users.username,
            bio: users.bio,
            profileImageUrl: users.profileImageUrl,
            membershipRole: communityMemberships.role,
            joinedCommunityAt: communityMemberships.joinedAt,
          })
          .from(communityRoomAttendees)
          .innerJoin(users, eq(users.id, communityRoomAttendees.userId))
          .leftJoin(
            communityMemberships,
            and(
              eq(communityMemberships.userId, communityRoomAttendees.userId),
              eq(
                communityMemberships.communityId,
                access.room.communityId,
              ),
            ),
          )
          .where(eq(communityRoomAttendees.roomId, access.room.id))
          .orderBy(users.displayName);
        if (!attendees.length) return res.json([]);
        const history = await db
          .select({
            userId: communityRoomAttendees.userId,
            roomResponses: count(communityRoomAttendees.id),
            roomCheckIns: sql<number>`count(${communityRoomAttendees.checkedInAt})`,
          })
          .from(communityRoomAttendees)
          .innerJoin(
            communityRooms,
            eq(communityRooms.id, communityRoomAttendees.roomId),
          )
          .where(
            and(
              eq(communityRooms.communityId, access.room.communityId),
              inArray(
                communityRoomAttendees.userId,
                attendees.map((attendee) => attendee.userId),
              ),
            ),
          )
          .groupBy(communityRoomAttendees.userId);
        const historyByUser = new Map(
          history.map((row) => [
            row.userId,
            {
              roomResponses: Number(row.roomResponses),
              roomCheckIns: Number(row.roomCheckIns),
            },
          ]),
        );
        res.json(
          attendees.map((attendee) => ({
            ...attendee,
            verifiedRoomHistory: historyByUser.get(attendee.userId) ?? {
              roomResponses: 0,
              roomCheckIns: 0,
            },
            analysis: null,
          })),
        );
      } catch (error) {
        console.error("Could not load room guest briefs:", error);
        res.status(500).json({ message: "Could not load room guest briefs" });
      }
    },
  );

  app.patch(
    "/api/community-rooms/:id/intelligence/insights/:insightId",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!access.canManage)
          return res.status(403).json({
            message: "Only the host or a community manager can review room suggestions",
          });
        if (!canContributeToCommunity(access.membership.status))
          return res.status(403).json({
            message: "Your community access is currently read-only",
          });
        const parsed = roomInsightReviewInputSchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(400).json({
            message: "Choose whether to save this suggestion as a note, action item, or dismiss it",
          });

        const result = await db.transaction(async (tx) => {
          const [insight] = await tx
            .select()
            .from(communityRoomInsights)
            .where(
              and(
                eq(communityRoomInsights.id, req.params.insightId),
                eq(communityRoomInsights.roomId, access.room.id),
              ),
            )
            .for("update")
            .limit(1);
          if (!insight) return { kind: "not_found" as const };
          if (insight.status !== "draft")
            return { kind: "already_reviewed" as const };

          const reviewedAt = new Date();
          let acceptedNoteId: string | null = null;
          let acceptedActionItemId: string | null = null;
          let artifact: Record<string, unknown> | null = null;

          if (parsed.data.decision === "accept_note") {
            const content = acceptedRoomInsightContent(insight);
            if (content.length > 20_000)
              return { kind: "note_too_long" as const };
            const [note] = await tx
              .insert(communityRoomNotes)
              .values({
                roomId: access.room.id,
                authorUserId: req.dbUser!.id,
                content,
              })
              .returning();
            acceptedNoteId = note.id;
            artifact = note;
          } else if (parsed.data.decision === "accept_action") {
            const body = insight.title.trim();
            if (!body || body.length > 2_000)
              return { kind: "action_too_long" as const };
            const assigneeUserId = parsed.data.assigneeUserId ?? null;
            if (assigneeUserId !== null) {
              const [assigneeMembership] = await tx
                .select({ id: communityMemberships.id })
                .from(communityMemberships)
                .where(
                  and(
                    eq(
                      communityMemberships.communityId,
                      access.room.communityId,
                    ),
                    eq(communityMemberships.userId, assigneeUserId),
                    ne(communityMemberships.status, "banned"),
                  ),
                )
                .limit(1);
              if (!assigneeMembership)
                return { kind: "invalid_assignee" as const };
            }
            const [actionItem] = await tx
              .insert(communityRoomActionItems)
              .values({
                roomId: access.room.id,
                createdByUserId: req.dbUser!.id,
                assigneeUserId,
                body,
                dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
              })
              .returning();
            acceptedActionItemId = actionItem.id;
            artifact = actionItem;
          }

          const [reviewedInsight] = await tx
            .update(communityRoomInsights)
            .set({
              status: parsed.data.decision,
              reviewedByUserId: req.dbUser!.id,
              reviewedAt,
              acceptedNoteId,
              acceptedActionItemId,
            })
            .where(eq(communityRoomInsights.id, insight.id))
            .returning();
          return {
            kind: "reviewed" as const,
            insight: reviewedInsight,
            artifact,
          };
        });

        if (result.kind === "not_found")
          return res.status(404).json({ message: "Room suggestion not found" });
        if (result.kind === "already_reviewed")
          return res.status(409).json({
            message: "This room suggestion has already been reviewed",
          });
        if (result.kind === "invalid_assignee")
          return res.status(400).json({
            message: "Assign this follow-up to an active community member",
          });
        if (result.kind === "note_too_long")
          return res.status(400).json({
            message: "This suggestion is too long to save as one room note",
          });
        if (result.kind === "action_too_long")
          return res.status(400).json({
            message: "This suggestion title is too long to use as an action item",
          });

        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: access.room.id,
          eventType: "community.room.insight.reviewed",
          actorUserId: req.dbUser!.id,
          payload: {
            communityId: access.room.communityId,
            insightId: result.insight.id,
            decision: parsed.data.decision,
            acceptedNoteId: result.insight.acceptedNoteId,
            acceptedActionItemId: result.insight.acceptedActionItemId,
          },
          idempotencyKey: `community.room.insight.reviewed:${result.insight.id}`,
        }).catch((error) =>
          console.error("Failed to enqueue room insight review event:", error),
        );
        res.json(result);
      } catch (error) {
        console.error("Could not review room suggestion:", error);
        res.status(500).json({ message: "Could not review room suggestion" });
      }
    },
  );

  app.post(
    "/api/community-rooms/:id/livekit-token",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (access.room.provider !== "livekit")
          return res.status(409).json({
            message: "This room does not use the CreativesOS native provider",
          });
        if (access.room.status !== "live")
          return res.status(409).json({
            message: "This room must be live before participants can join",
          });
        const configuration = getLiveKitConfiguration();
        if (!configuration)
          return res.status(503).json({
            message: "Native community rooms are not configured yet",
          });

        const requiredConsentCapabilities =
          activeRoomConsentCapabilities(access.room);
        if (requiredConsentCapabilities.length > 0) {
          const grantedConsents = await db
            .select({ capability: communityRoomConsents.capability })
            .from(communityRoomConsents)
            .where(
              and(
                eq(communityRoomConsents.roomId, access.room.id),
                eq(communityRoomConsents.userId, req.dbUser!.id),
                eq(communityRoomConsents.decision, "granted"),
                inArray(
                  communityRoomConsents.capability,
                  requiredConsentCapabilities,
                ),
              ),
            );
          const missingConsentCapabilities = missingRoomConsentCapabilities(
            requiredConsentCapabilities,
            grantedConsents.map((consent) => consent.capability),
          );
          if (missingConsentCapabilities.length > 0)
            return res.status(428).json({
              code: "CONSENT_REQUIRED",
              message:
                "Review and grant the active room permissions before joining",
              missingConsentCapabilities,
            });
        }

        const now = new Date();
        await db
          .insert(communityRoomAttendees)
          .values({
            roomId: access.room.id,
            userId: req.dbUser!.id,
            status: "going",
            checkedInAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              communityRoomAttendees.roomId,
              communityRoomAttendees.userId,
            ],
            set: { status: "going", checkedInAt: now, updatedAt: now },
          });

        res.json(
          await createLiveKitParticipantToken(configuration, {
            roomId: access.room.id,
            communityId: access.room.communityId,
            userId: req.dbUser!.id,
            displayName:
              req.dbUser!.displayName || req.dbUser!.username || "Creative member",
            role: access.membership.role,
            canPublish: canContributeToCommunity(access.membership.status),
          }),
        );
      } catch (error) {
        console.error("Could not issue native room token:", error);
        res.status(500).json({ message: "Could not join this native room" });
      }
    },
  );

  app.put("/api/community-rooms/:id/rsvp", attachUser, async (req, res) => {
    try {
      const access = await roomAccess(req.params.id, req.dbUser!.id);
      if (!access.ok)
        return res.status(access.status).json({ message: access.message });
      if (!canContributeToCommunity(access.membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const status =
        typeof req.body?.status === "string" ? req.body.status : "";
      if (!isCommunityRoomAttendanceStatus(status))
        return res
          .status(400)
          .json({ message: "Choose going, interested, or declined" });
      if (!canRsvpToCommunityRoom(access.room.status))
        return res
          .status(409)
          .json({ message: "RSVP is closed for this room" });
      const [attendance] = await db
        .insert(communityRoomAttendees)
        .values({
          roomId: access.room.id,
          userId: req.dbUser!.id,
          status,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            communityRoomAttendees.roomId,
            communityRoomAttendees.userId,
          ],
          set: {
            status,
            checkedInAt: status === "going" ? undefined : null,
            updatedAt: new Date(),
          },
        })
        .returning();
      res.json(attendance);
    } catch {
      res.status(500).json({ message: "Could not save room RSVP" });
    }
  });

  app.post(
    "/api/community-rooms/:id/check-in",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!canContributeToCommunity(access.membership.status))
          return res
            .status(403)
            .json({ message: "Your community access is currently read-only" });
        if (access.room.status !== "live")
          return res
            .status(409)
            .json({ message: "You can check in once this room is live" });
        const now = new Date();
        const [attendance] = await db
          .insert(communityRoomAttendees)
          .values({
            roomId: access.room.id,
            userId: req.dbUser!.id,
            status: "going",
            checkedInAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              communityRoomAttendees.roomId,
              communityRoomAttendees.userId,
            ],
            set: { status: "going", checkedInAt: now, updatedAt: now },
          })
          .returning();
        res.json(attendance);
      } catch {
        res.status(500).json({ message: "Could not check in to this room" });
      }
    },
  );

  app.patch("/api/community-rooms/:id", attachUser, async (req, res) => {
    try {
      const access = await roomAccess(req.params.id, req.dbUser!.id);
      if (!access.ok)
        return res.status(access.status).json({ message: access.message });
      if (!access.canManage)
        return res.status(403).json({
          message: "Only the host or a community manager can update this room",
        });
      if (!canContributeToCommunity(access.membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const status =
        typeof req.body?.status === "string"
          ? req.body.status
          : access.room.status;
      const joinUrl =
        req.body?.joinUrl === undefined
          ? access.room.joinUrl
          : parseRoomUrl(req.body.joinUrl);
      const title =
        req.body?.title === undefined
          ? access.room.title
          : typeof req.body.title === "string"
            ? req.body.title.trim()
            : "";
      const description =
        req.body?.description === undefined
          ? access.room.description
          : typeof req.body.description === "string"
            ? req.body.description.trim()
            : "";
      const startsAt =
        req.body?.startsAt === undefined
          ? access.room.startsAt
          : parseRoomDate(req.body.startsAt);
      const provider =
        req.body?.provider === undefined
          ? access.room.provider
          : typeof req.body.provider === "string"
            ? req.body.provider
            : "";
      if (
        !communityRoomStatuses.has(status) ||
        joinUrl === undefined ||
        !title ||
        title.length > 160 ||
        description.length > 10_000 ||
        !startsAt ||
        !communityRoomProviders.has(provider)
      )
        return res.status(400).json({ message: "Invalid room update" });
      if (access.room.status === "ended" || access.room.status === "canceled")
        return res
          .status(409)
          .json({ message: "Closed rooms cannot be reopened" });
      if (
        access.room.status === "scheduled" &&
        !["scheduled", "live", "canceled"].includes(status)
      )
        return res
          .status(409)
          .json({ message: "Invalid room status transition" });
      if (
        status === "live" &&
        provider === "livekit" &&
        !getLiveKitConfiguration()
      )
        return res.status(503).json({
          message: "Native community rooms are not configured yet",
        });
      if (
        access.room.status === "live" &&
        !["live", "ended", "canceled"].includes(status)
      )
        return res
          .status(409)
          .json({ message: "Invalid room status transition" });
      const detailsChanged =
        title !== access.room.title ||
        description !== access.room.description ||
        startsAt.valueOf() !== access.room.startsAt.valueOf() ||
        provider !== access.room.provider ||
        joinUrl !== access.room.joinUrl;
      if (detailsChanged && access.room.status !== "scheduled")
        return res
          .status(409)
          .json({ message: "Only scheduled rooms can change their details" });
      if (
        access.room.status === "live" &&
        ["ended", "canceled"].includes(status)
      ) {
        try {
          await stopRoomMediaBeforeClose(access.room);
        } catch (error) {
          console.error("Could not stop room media before closing:", error);
          return res.status(502).json({
            message:
              "Recording and realtime services must stop successfully before this room can close",
          });
        }
      }
      const [room] = await db
        .update(communityRooms)
        .set({
          title,
          description,
          startsAt,
          provider,
          status,
          joinUrl,
          endedAt: status === "ended" ? new Date() : access.room.endedAt,
          recordingEnabled:
            status === "ended" || status === "canceled"
              ? false
              : access.room.recordingEnabled,
          transcriptionEnabled:
            status === "ended" || status === "canceled"
              ? false
              : access.room.transcriptionEnabled,
          aiAssistanceEnabled:
            status === "ended" || status === "canceled"
              ? false
              : access.room.aiAssistanceEnabled,
          updatedAt: new Date(),
        })
        .where(eq(communityRooms.id, access.room.id))
        .returning();
      if (room.status !== access.room.status)
        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: room.id,
          eventType: `community.room.${room.status}`,
          actorUserId: req.dbUser!.id,
          payload: { communityId: room.communityId, provider: room.provider },
          idempotencyKey: `community.room.${room.status}:${room.id}`,
        }).catch((error) =>
          console.error("Failed to enqueue community room projection:", error),
        );
      else if (detailsChanged)
        void emitProjectionEvent({
          aggregateType: "community_room",
          aggregateId: room.id,
          eventType: "community.room.updated",
          actorUserId: req.dbUser!.id,
          payload: {
            communityId: room.communityId,
            provider: room.provider,
            startsAt: room.startsAt.toISOString(),
          },
          idempotencyKey: `community.room.updated:${room.id}:${room.updatedAt.toISOString()}`,
        }).catch((error) =>
          console.error("Failed to enqueue community room update:", error),
        );
      res.json(room);
    } catch {
      res.status(500).json({ message: "Could not update community room" });
    }
  });

  app.get("/api/community-rooms/:id/notes", attachUser, async (req, res) => {
    const access = await roomAccess(req.params.id, req.dbUser!.id);
    if (!access.ok)
      return res.status(access.status).json({ message: access.message });
    res.json(
      await db
        .select({
          id: communityRoomNotes.id,
          roomId: communityRoomNotes.roomId,
          authorUserId: communityRoomNotes.authorUserId,
          authorDisplayName: users.displayName,
          authorUsername: users.username,
          content: communityRoomNotes.content,
          visibility: communityRoomNotes.visibility,
          createdAt: communityRoomNotes.createdAt,
          updatedAt: communityRoomNotes.updatedAt,
        })
        .from(communityRoomNotes)
        .innerJoin(users, eq(users.id, communityRoomNotes.authorUserId))
        .where(eq(communityRoomNotes.roomId, access.room.id))
        .orderBy(communityRoomNotes.createdAt),
    );
  });

  app.post("/api/community-rooms/:id/notes", attachUser, async (req, res) => {
    try {
      const access = await roomAccess(req.params.id, req.dbUser!.id);
      if (!access.ok)
        return res.status(access.status).json({ message: access.message });
      if (!canContributeToCommunity(access.membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const content =
        typeof req.body?.content === "string" ? req.body.content.trim() : "";
      if (!content || content.length > 20_000)
        return res
          .status(400)
          .json({ message: "A note must be between 1 and 20,000 characters" });
      const [note] = await db
        .insert(communityRoomNotes)
        .values({
          roomId: access.room.id,
          authorUserId: req.dbUser!.id,
          content,
        })
        .returning();
      res.status(201).json(note);
    } catch {
      res.status(500).json({ message: "Could not save room note" });
    }
  });

  app.get(
    "/api/community-rooms/:id/action-items",
    attachUser,
    async (req, res) => {
      const access = await roomAccess(req.params.id, req.dbUser!.id);
      if (!access.ok)
        return res.status(access.status).json({ message: access.message });
      res.json(
        await db
          .select({
            id: communityRoomActionItems.id,
            roomId: communityRoomActionItems.roomId,
            createdByUserId: communityRoomActionItems.createdByUserId,
            assigneeUserId: communityRoomActionItems.assigneeUserId,
            assigneeDisplayName: users.displayName,
            assigneeUsername: users.username,
            body: communityRoomActionItems.body,
            dueAt: communityRoomActionItems.dueAt,
            completedAt: communityRoomActionItems.completedAt,
            createdAt: communityRoomActionItems.createdAt,
            updatedAt: communityRoomActionItems.updatedAt,
          })
          .from(communityRoomActionItems)
          .leftJoin(users, eq(users.id, communityRoomActionItems.assigneeUserId))
          .where(eq(communityRoomActionItems.roomId, access.room.id))
          .orderBy(communityRoomActionItems.createdAt),
      );
    },
  );

  app.post(
    "/api/community-rooms/:id/action-items",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!canContributeToCommunity(access.membership.status))
          return res
            .status(403)
            .json({ message: "Your community access is currently read-only" });
        const body =
          typeof req.body?.body === "string" ? req.body.body.trim() : "";
        const dueAt =
          req.body?.dueAt === undefined ||
          req.body?.dueAt === null ||
          req.body?.dueAt === ""
            ? null
            : parseRoomDate(req.body.dueAt);
        const assigneeUserId =
          req.body?.assigneeUserId === undefined ||
          req.body?.assigneeUserId === null ||
          req.body?.assigneeUserId === ""
            ? null
            : Number(req.body.assigneeUserId);
        if (
          !body ||
          body.length > 2_000 ||
          (dueAt === null && req.body?.dueAt) ||
          (assigneeUserId !== null && !Number.isInteger(assigneeUserId))
        )
          return res.status(400).json({
            message: "Provide a valid action item, due date, and assignee",
          });
        if (assigneeUserId !== null) {
          const [assigneeMembership] = await db
            .select({ id: communityMemberships.id })
            .from(communityMemberships)
            .where(
              and(
                eq(communityMemberships.communityId, access.room.communityId),
                eq(communityMemberships.userId, assigneeUserId),
                ne(communityMemberships.status, "banned"),
              ),
            )
            .limit(1);
          if (!assigneeMembership)
            return res.status(400).json({
              message: "Assign this follow-up to an active community member",
            });
        }
        const [actionItem] = await db
          .insert(communityRoomActionItems)
          .values({
            roomId: access.room.id,
            createdByUserId: req.dbUser!.id,
            assigneeUserId,
            body,
            dueAt,
          })
          .returning();
        res.status(201).json(actionItem);
      } catch {
        res.status(500).json({ message: "Could not save action item" });
      }
    },
  );

  app.patch(
    "/api/community-rooms/:id/action-items/:actionItemId",
    attachUser,
    async (req, res) => {
      try {
        const access = await roomAccess(req.params.id, req.dbUser!.id);
        if (!access.ok)
          return res.status(access.status).json({ message: access.message });
        if (!canContributeToCommunity(access.membership.status))
          return res
            .status(403)
            .json({ message: "Your community access is currently read-only" });
        const [item] = await db
          .select()
          .from(communityRoomActionItems)
          .where(
            and(
              eq(communityRoomActionItems.id, req.params.actionItemId),
              eq(communityRoomActionItems.roomId, access.room.id),
            ),
          )
          .limit(1);
        if (!item)
          return res.status(404).json({ message: "Action item not found" });
        if (
          !access.canManage &&
          item.createdByUserId !== req.dbUser!.id &&
          item.assigneeUserId !== req.dbUser!.id
        )
          return res
            .status(403)
            .json({ message: "You cannot update this action item" });
        if (typeof req.body?.completed !== "boolean")
          return res
            .status(400)
            .json({ message: "Specify whether the action item is complete" });
        const [updated] = await db
          .update(communityRoomActionItems)
          .set({
            completedAt: req.body.completed ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(communityRoomActionItems.id, item.id))
          .returning();
        res.json(updated);
      } catch {
        res.status(500).json({ message: "Could not update action item" });
      }
    },
  );

  // Channel routes
  app.get(
    "/api/communities/:communityId/channels",
    attachUser,
    async (req, res) => {
      try {
        const communityId = parseInt(req.params.communityId);
        if (
          !Number.isInteger(communityId) ||
          !(await storage.getCommunityById(communityId))
        )
          return res.status(404).json({ message: "Community not found" });
        const membership = await storage.getCommunityMembership(
          req.dbUser!.id,
          communityId,
        );
        if (!membership)
          return res
            .status(403)
            .json({ message: "Join this community to view its channels" });
        const channels = await storage.getChannelsByCommunityId(communityId);
        res.json(channels);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch channels" });
      }
    },
  );

  app.post("/api/channels", attachUser, async (req, res) => {
    try {
      const parsed = createCommunityChannelInputSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          message: "A valid community and channel name are required",
        });
      const { communityId, name } = parsed.data;
      if (
        !(await storage.getCommunityById(communityId))
      )
        return res.status(404).json({ message: "Community not found" });
      const membership = Number.isInteger(communityId)
        ? await storage.getCommunityMembership(req.dbUser!.id, communityId)
        : undefined;
      if (!membership || !["owner", "admin"].includes(membership.role))
        return res
          .status(403)
          .json({ message: "Only community managers can create channels" });
      if (!canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const channel = await storage.createChannel({ communityId, name });
      res.status(201).json(channel);
    } catch (error) {
      res.status(500).json({ message: "Failed to create channel" });
    }
  });

  // Channel Message routes
  app.get("/api/channels/:channelId/messages", attachUser, async (req, res) => {
    try {
      const channel = await storage.getChannelById(
        parseInt(req.params.channelId),
      );
      if (!channel)
        return res.status(404).json({ message: "Channel not found" });
      if (!(await storage.getCommunityById(channel.communityId)))
        return res.status(404).json({ message: "Community not found" });
      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        channel.communityId,
      );
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community to view its messages" });
      const messages = await storage.getMessagesByChannelId(channel.id);
      const messageIds = messages.map((message) => message.id);
      const selectedLikes =
        messageIds.length === 0
          ? []
          : await db
              .select({ messageId: channelMessageLikes.messageId })
              .from(channelMessageLikes)
              .where(
                and(
                  eq(channelMessageLikes.userId, req.dbUser!.id),
                  inArray(channelMessageLikes.messageId, messageIds),
                ),
              );
      const selectedMessageIds = new Set(
        selectedLikes.map((like) => like.messageId),
      );
      res.json(
        messages.map((message) => ({
          ...message,
          likedByCurrentUser: selectedMessageIds.has(message.id),
        })),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/channel-messages", attachUser, async (req, res) => {
    try {
      const channel = await storage.getChannelById(req.body.channelId);
      if (!channel)
        return res.status(404).json({ message: "Channel not found" });
      if (!(await storage.getCommunityById(channel.communityId)))
        return res.status(404).json({ message: "Community not found" });
      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        channel.communityId,
      );
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community before posting" });
      if (!canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      if (
        typeof req.body?.content !== "string" ||
        !req.body.content.trim() ||
        req.body.content.length > 10_000
      )
        return res.status(400).json({
          message: "A message must be between 1 and 10,000 characters",
        });
      const parentMessageId =
        req.body?.parentMessageId === undefined ||
        req.body?.parentMessageId === null
          ? null
          : Number(req.body.parentMessageId);
      if (
        parentMessageId !== null &&
        (!Number.isInteger(parentMessageId) || parentMessageId < 1)
      )
        return res
          .status(400)
          .json({ message: "A valid parent message is required" });
      if (parentMessageId !== null) {
        const [parent] = await db
          .select()
          .from(channelMessages)
          .where(eq(channelMessages.id, parentMessageId))
          .limit(1);
        if (!parent || parent.channelId !== channel.id)
          return res
            .status(400)
            .json({ message: "Replies must belong to the same channel" });
        if (parent.parentMessageId !== null)
          return res
            .status(400)
            .json({ message: "Replies can be one level deep" });
      }
      const message = await storage.createChannelMessage({
        channelId: channel.id,
        userId: req.dbUser!.id,
        parentMessageId,
        content: req.body.content.trim(),
        isPinned: false,
      });
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  app.post("/api/channel-messages/:id/pin", attachUser, async (req, res) => {
    try {
      const [existing] = await db
        .select()
        .from(channelMessages)
        .where(eq(channelMessages.id, parseInt(req.params.id)))
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Message not found" });
      const channel = await storage.getChannelById(existing.channelId);
      if (channel && !(await storage.getCommunityById(channel.communityId)))
        return res.status(404).json({ message: "Community not found" });
      const membership = channel
        ? await storage.getCommunityMembership(
            req.dbUser!.id,
            channel.communityId,
          )
        : undefined;
      if (!membership || !["owner", "admin"].includes(membership.role))
        return res
          .status(403)
          .json({ message: "Only community owners can pin messages" });
      if (!canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const message = await storage.pinChannelMessage(existing.id);
      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to pin message" });
    }
  });

  app.post("/api/channel-messages/:id/like", attachUser, async (req, res) => {
    try {
      const [existing] = await db
        .select()
        .from(channelMessages)
        .where(eq(channelMessages.id, parseInt(req.params.id)))
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Message not found" });
      const channel = await storage.getChannelById(existing.channelId);
      if (channel && !(await storage.getCommunityById(channel.communityId)))
        return res.status(404).json({ message: "Community not found" });
      const membership = channel
        ? await storage.getCommunityMembership(
            req.dbUser!.id,
            channel.communityId,
          )
        : undefined;
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community before liking messages" });
      if (!canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const result = await db.transaction(async (tx) => {
        const [selected] = await tx
          .select()
          .from(channelMessageLikes)
          .where(
            and(
              eq(channelMessageLikes.messageId, existing.id),
              eq(channelMessageLikes.userId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (selected) {
          await tx
            .delete(channelMessageLikes)
            .where(eq(channelMessageLikes.id, selected.id));
          const [message] = await tx
            .update(channelMessages)
            .set({ likes: sql`GREATEST(${channelMessages.likes} - 1, 0)` })
            .where(eq(channelMessages.id, existing.id))
            .returning();
          return { message, liked: false };
        }
        await tx
          .insert(channelMessageLikes)
          .values({ messageId: existing.id, userId: req.dbUser!.id });
        const [message] = await tx
          .update(channelMessages)
          .set({ likes: sql`${channelMessages.likes} + 1` })
          .where(eq(channelMessages.id, existing.id))
          .returning();
        return { message, liked: true };
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to like message" });
    }
  });

  app.get("/api/channels/:channelId/polls", attachUser, async (req, res) => {
    try {
      const channelId = Number(req.params.channelId);
      const channel = await storage.getChannelById(channelId);
      if (!channel || !(await storage.getCommunityById(channel.communityId)))
        return res.status(404).json({ message: "Channel not found" });
      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        channel.communityId,
      );
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community to view its polls" });
      const polls = await db
        .select()
        .from(channelPolls)
        .where(eq(channelPolls.channelId, channel.id))
        .orderBy(desc(channelPolls.createdAt));
      if (!polls.length) return res.json([]);
      const pollIds = polls.map((poll) => poll.id);
      const [options, votes, selectedVotes] = await Promise.all([
        db
          .select()
          .from(channelPollOptions)
          .where(inArray(channelPollOptions.pollId, pollIds)),
        db
          .select({
            pollId: channelPollVotes.pollId,
            optionId: channelPollVotes.optionId,
          })
          .from(channelPollVotes)
          .where(inArray(channelPollVotes.pollId, pollIds)),
        db
          .select({
            pollId: channelPollVotes.pollId,
            optionId: channelPollVotes.optionId,
          })
          .from(channelPollVotes)
          .where(
            and(
              eq(channelPollVotes.userId, req.dbUser!.id),
              inArray(channelPollVotes.pollId, pollIds),
            ),
          ),
      ]);
      const selectedByPoll = new Map(
        selectedVotes.map((vote) => [vote.pollId, vote.optionId]),
      );
      res.json(
        polls.map((poll) => ({
          ...poll,
          currentOptionId: selectedByPoll.get(poll.id) ?? null,
          options: options
            .filter((option) => option.pollId === poll.id)
            .sort((a, b) => a.position - b.position)
            .map((option) => ({
              ...option,
              votes: votes.filter((vote) => vote.optionId === option.id).length,
            })),
        })),
      );
    } catch {
      res.status(500).json({ message: "Failed to fetch polls" });
    }
  });

  app.post("/api/channels/:channelId/polls", attachUser, async (req, res) => {
    try {
      const channelId = Number(req.params.channelId);
      const channel = await storage.getChannelById(channelId);
      if (!channel || !(await storage.getCommunityById(channel.communityId)))
        return res.status(404).json({ message: "Channel not found" });
      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        channel.communityId,
      );
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community before creating a poll" });
      if (!canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const question =
        typeof req.body?.question === "string" ? req.body.question.trim() : "";
      const rawOptions: unknown[] = Array.isArray(req.body?.options)
        ? req.body.options
        : [];
      const options: string[] = rawOptions
        .map((option) => (typeof option === "string" ? option.trim() : ""))
        .filter(Boolean);
      if (!question || question.length > 500)
        return res.status(400).json({
          message: "A poll question must be between 1 and 500 characters",
        });
      if (
        options.length < 2 ||
        options.length > 8 ||
        options.some((option) => option.length > 160)
      )
        return res.status(400).json({
          message:
            "A poll needs between 2 and 8 options of up to 160 characters",
        });
      const closesAt = req.body?.closesAt ? new Date(req.body.closesAt) : null;
      if (
        closesAt &&
        (Number.isNaN(closesAt.valueOf()) || closesAt <= new Date())
      )
        return res
          .status(400)
          .json({ message: "Poll closing time must be in the future" });
      const poll = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(channelPolls)
          .values({
            channelId: channel.id,
            userId: req.dbUser!.id,
            question,
            closesAt,
          })
          .returning();
        const createdOptions = await tx
          .insert(channelPollOptions)
          .values(
            options.map((label, position) => ({
              pollId: created.id,
              label,
              position,
            })),
          )
          .returning();
        return {
          ...created,
          currentOptionId: null,
          options: createdOptions.map((option) => ({ ...option, votes: 0 })),
        };
      });
      res.status(201).json(poll);
    } catch {
      res.status(500).json({ message: "Failed to create poll" });
    }
  });

  app.post("/api/channel-polls/:id/vote", attachUser, async (req, res) => {
    try {
      const pollId = Number(req.params.id);
      const optionId = Number(req.body?.optionId);
      if (!Number.isInteger(pollId) || !Number.isInteger(optionId))
        return res
          .status(400)
          .json({ message: "A poll and option are required" });
      const [poll] = await db
        .select()
        .from(channelPolls)
        .where(eq(channelPolls.id, pollId))
        .limit(1);
      if (!poll || (poll.closesAt && poll.closesAt <= new Date()))
        return res.status(404).json({ message: "This poll is unavailable" });
      const channel = await storage.getChannelById(poll.channelId);
      if (!channel || !(await storage.getCommunityById(channel.communityId)))
        return res.status(404).json({ message: "Channel not found" });
      const membership = await storage.getCommunityMembership(
        req.dbUser!.id,
        channel.communityId,
      );
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community before voting" });
      if (!canContributeToCommunity(membership.status))
        return res
          .status(403)
          .json({ message: "Your community access is currently read-only" });
      const [option] = await db
        .select()
        .from(channelPollOptions)
        .where(
          and(
            eq(channelPollOptions.id, optionId),
            eq(channelPollOptions.pollId, poll.id),
          ),
        )
        .limit(1);
      if (!option)
        return res
          .status(400)
          .json({ message: "That option does not belong to this poll" });
      await db.transaction(async (tx) => {
        await tx
          .delete(channelPollVotes)
          .where(
            and(
              eq(channelPollVotes.pollId, poll.id),
              eq(channelPollVotes.userId, req.dbUser!.id),
            ),
          );
        await tx.insert(channelPollVotes).values({
          pollId: poll.id,
          optionId: option.id,
          userId: req.dbUser!.id,
        });
      });
      res.json({ pollId: poll.id, optionId: option.id });
    } catch {
      res.status(500).json({ message: "Failed to vote in poll" });
    }
  });

  // Revenue routes
  app.get("/api/users/:userId/revenue", attachUser, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (req.dbUser!.id !== userId) {
        return res
          .status(403)
          .json({ message: "You can only access your own revenue" });
      }
      const revenue = await storage.getRevenueByUserId(userId);
      res.json(revenue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch revenue data" });
    }
  });

  // Contact routes
  app.get("/api/users/:userId/contacts", attachUser, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (req.dbUser!.id !== userId) {
        return res
          .status(403)
          .json({ message: "You can only access your own contacts" });
      }
      const contacts = await storage.getContactsByUserId(userId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  app.post("/api/contacts", attachUser, async (req, res) => {
    try {
      const fields = parseContactFields(req.body);
      if (!fields) {
        return res.status(400).json({ message: "Contact details are invalid" });
      }
      const contact = await storage.createContact({
        ...fields,
        userId: req.dbUser!.id,
        contactImage: null,
      });
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  app.patch("/api/contacts/:id", attachUser, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const ownership = await requireContactOwner(contactId, req.dbUser!.id);
      if (!("contact" in ownership)) {
        return res.status(ownership.status).json({ message: ownership.message });
      }
      const fields = parseContactFields(req.body);
      if (!fields) {
        return res.status(400).json({ message: "Contact details are invalid" });
      }
      const contact = await storage.updateContact(contactId, fields.contactName, fields.purchaseInfo);
      res.json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  app.delete("/api/contacts/:id", attachUser, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const ownership = await requireContactOwner(contactId, req.dbUser!.id);
      if (!("contact" in ownership)) {
        return res.status(ownership.status).json({ message: ownership.message });
      }
      await storage.deleteContact(contactId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // Document routes
  app.get("/api/users/:userId/documents", attachUser, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (req.dbUser!.id !== userId) {
        return res
          .status(403)
          .json({ message: "You can only access your own documents" });
      }
      const documents = await storage.getDocumentsByUserId(userId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", attachUser, async (req, res) => {
    try {
      const ownership = await requireDocumentOwner(
        parseInt(req.params.id),
        req.dbUser!.id,
      );
      if (!("document" in ownership)) {
        return res
          .status(ownership.status)
          .json({ message: ownership.message });
      }
      res.json(ownership.document);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", attachUser, async (req, res) => {
    try {
      const fields = parseDocumentFields(req.body);
      if (!fields) {
        return res.status(400).json({ message: "Document details are invalid" });
      }
      const document = await storage.createDocument({
        ...fields,
        userId: req.dbUser!.id,
      });
      res.status(201).json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.put("/api/documents/:id", attachUser, async (req, res) => {
    try {
      const ownership = await requireDocumentOwner(
        parseInt(req.params.id),
        req.dbUser!.id,
      );
      if (!("document" in ownership)) {
        return res
          .status(ownership.status)
          .json({ message: ownership.message });
      }
      const fields = parseDocumentFields(req.body);
      if (!fields) {
        return res.status(400).json({ message: "Document details are invalid" });
      }
      const document = await storage.updateDocument(
        parseInt(req.params.id),
        fields.title,
        fields.content,
      );
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", attachUser, async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const ownership = await requireDocumentOwner(documentId, req.dbUser!.id);
      if (!("document" in ownership)) {
        return res.status(ownership.status).json({ message: ownership.message });
      }
      await storage.deleteDocument(documentId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Messaging routes
  // Get all conversations for a user
  app.get("/api/users/:userId/conversations", attachUser, async (req, res) => {
    try {
      if (parseInt(req.params.userId) !== req.dbUser!.id) {
        return res
          .status(403)
          .json({ message: "You can only view your own conversations" });
      }
      const conversations = await storage.getConversationsByUserId(
        parseInt(req.params.userId),
      );
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Create a new conversation
  app.post("/api/conversations", attachUser, async (req, res) => {
    try {
      const { userIds, name, isGroup } = req.body;
      console.log("Received conversation creation request:", {
        userIds,
        name,
        isGroup,
      });

      if (!userIds || !Array.isArray(userIds) || userIds.length < 2) {
        console.error("Invalid userIds:", userIds);
        return res
          .status(400)
          .json({ message: "At least two users are required" });
      }

      if (!userIds.includes(req.dbUser!.id)) {
        return res
          .status(403)
          .json({ message: "You must be a participant in the conversation" });
      }

      // Check all userIds are valid numbers
      const invalidIds = userIds.filter((id) => typeof id !== "number");
      if (invalidIds.length > 0) {
        console.error("Invalid user IDs (not numbers):", invalidIds);
        return res
          .status(400)
          .json({ message: "All user IDs must be numbers" });
      }

      // Direct-message creation is serialized by the participant pair. Without
      // the database lock, two devices opening the same chat at once can both
      // pass the read-before-write check and create duplicate inbox threads.
      if (userIds.length === 2 && !name && !isGroup) {
        const pair = Array.from(new Set<number>(userIds)).sort((a, b) => a - b);
        if (pair.length !== 2) return res.status(400).json({ message: "A direct message requires two different users" });
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`native-dm:${pair[0]}:${pair[1]}`}, 0))`);
          const userConversations = await storage.getConversationsByUserId(pair[0]);
          for (const conversation of userConversations) {
            if (conversation.isGroup) continue;
            const participants = await storage.getParticipantsByConversationId(conversation.id);
            const participantIds = participants.map((participant) => participant.userId).sort((a, b) => a - b);
            if (participantIds.length === 2 && participantIds[0] === pair[0] && participantIds[1] === pair[1]) {
              return { conversation, created: false };
            }
          }
          const conversation = await storage.createConversation(pair, undefined, false);
          for (const userId of pair) await storage.addParticipantToConversation(conversation.id, userId);
          return { conversation, created: true };
        });
        const currentBusiness = await ensureDefaultBusiness(req.dbUser!);
        await syncLegacyNativeConversation({ businessId: currentBusiness.id, nativeConversationId: result.conversation.id, currentUserId: req.dbUser!.id });
        return res.status(result.created ? 201 : 200).json(result.conversation);
      }

      // If no existing conversation or this is a group chat, create a new one
      console.log(
        "Creating conversation with userIds:",
        userIds,
        "name:",
        name,
        "isGroup:",
        isGroup,
      );
      const conversation = await storage.createConversation(
        userIds,
        name,
        isGroup,
      );
      console.log("Created conversation:", conversation);

      // Add participants to the conversation
      console.log("Adding participants to conversation:", conversation.id);
      for (const userId of userIds) {
        await storage.addParticipantToConversation(conversation.id, userId);
      }

      const currentBusiness = await ensureDefaultBusiness(req.dbUser!);
      await syncLegacyNativeConversation({ businessId: currentBusiness.id, nativeConversationId: conversation.id, currentUserId: req.dbUser!.id });

      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({
        message: "Failed to create conversation",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get messages for a conversation
  app.get(
    "/api/conversations/:conversationId/messages",
    attachUser,
    async (req, res) => {
      try {
        const conversationId = parseInt(req.params.conversationId);
        const conversation = await storage.getConversationById(conversationId);
        if (
          !conversation?.participants.some(
            (participant) => participant.userId === req.dbUser!.id,
          )
        ) {
          return res.status(403).json({
            message: "You are not a participant in this conversation",
          });
        }
        const messages =
          await storage.getMessagesByConversationId(conversationId);
        res.json(messages);
      } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: "Failed to fetch messages" });
      }
    },
  );

  // Send a message
  app.post("/api/messages", attachUser, async (req, res) => {
    try {
      const conversationId = Number(req.body.conversationId);
      const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
      if (!Number.isInteger(conversationId) || conversationId <= 0 || !content || content.length > 10_000) {
        return res.status(400).json({ message: "A valid conversation and message are required" });
      }
      const replyToMessageId = req.body.replyToMessageId == null ? null : Number(req.body.replyToMessageId);
      if (replyToMessageId != null && (!Number.isInteger(replyToMessageId) || replyToMessageId <= 0)) {
        return res.status(400).json({ message: "Invalid reply target" });
      }
      const conversation = await storage.getConversationById(conversationId);
      if (
        !conversation?.participants.some(
          (participant) => participant.userId === req.dbUser!.id,
        )
      ) {
        return res
          .status(403)
          .json({ message: "You are not a participant in this conversation" });
      }
      if (replyToMessageId != null) {
        const [replyTarget] = await db.select({ conversationId: directMessages.conversationId }).from(directMessages).where(eq(directMessages.id, replyToMessageId)).limit(1);
        if (!replyTarget || replyTarget.conversationId !== conversationId) return res.status(400).json({ message: "Reply target is outside this conversation" });
      }
      const recipients = conversation.participants.filter((participant) => participant.userId !== req.dbUser!.id);
      const message = await db.transaction(async (tx) => {
        const [created] = await tx.insert(directMessages).values({
          conversationId,
          senderId: req.dbUser!.id,
          content,
          replyToMessageId,
        }).returning();
        const now = new Date();
        await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));
        const consentCommand = messagingConsentCommand(content);
        for (const recipient of recipients) {
          const [existingState] = await tx.select().from(automationContactStates).where(and(
            eq(automationContactStates.ownerUserId, recipient.userId),
            eq(automationContactStates.contactUserId, req.dbUser!.id),
            eq(automationContactStates.channel, "native"),
          )).limit(1);
          await tx.insert(automationContactStates).values({
            ownerUserId: recipient.userId,
            contactUserId: req.dbUser!.id,
            channel: "native",
            conversationId,
            optedOut: consentCommand === "opt_out",
            optedOutAt: consentCommand === "opt_out" ? now : null,
            lastInboundAt: now,
            updatedAt: now,
          }).onConflictDoUpdate({
            target: [automationContactStates.ownerUserId, automationContactStates.contactUserId, automationContactStates.channel],
            set: {
              conversationId,
              lastInboundAt: now,
              updatedAt: now,
              ...(consentCommand === "opt_out" ? { optedOut: true, optedOutAt: now } : {}),
              ...(consentCommand === "opt_in" ? { optedOut: false, optedOutAt: null, cooldownUntil: null } : {}),
            },
          });
          if (!consentCommand && !existingState?.optedOut) {
            await tx.insert(automationTriggerEvents).values({
              ownerUserId: recipient.userId,
              eventType: NATIVE_DM_RECEIVED_EVENT,
              idempotencyKey: `native:dm:${created.id}:owner:${recipient.userId}`,
              payload: {
                channel: "native",
                automated: false,
                actorUserId: req.dbUser!.id,
                actorDisplayName: req.dbUser!.displayName,
                messageId: created.id,
                conversationId,
                content: created.content,
              },
            }).onConflictDoNothing();
          }
        }
        return created;
      });
      const currentBusiness = await ensureDefaultBusiness(req.dbUser!);
      await syncLegacyNativeConversation({ businessId: currentBusiness.id, nativeConversationId: conversationId, currentUserId: req.dbUser!.id });
      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Edit a message
  app.patch("/api/messages/:id", attachUser, async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      const { content, isEdited } = req.body;
      const [existing] = await db
        .select()
        .from(directMessages)
        .where(eq(directMessages.id, messageId))
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Message not found" });
      if (existing.senderId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You can only edit your own messages" });

      const updatedMessage = await storage.updateDirectMessage(messageId, {
        content,
        isEdited: true,
      });

      res.json(updatedMessage);
    } catch (error) {
      console.error("Error updating message:", error);
      res.status(500).json({ message: "Failed to update message" });
    }
  });

  // Delete a message
  app.delete("/api/messages/:id", attachUser, async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      const [existing] = await db
        .select()
        .from(directMessages)
        .where(eq(directMessages.id, messageId))
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Message not found" });
      if (existing.senderId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You can only delete your own messages" });
      await storage.deleteDirectMessage(messageId);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({ message: "Failed to delete message" });
    }
  });

  // Add/update reaction to a message
  app.post("/api/messages/:id/reaction", attachUser, async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      const { reaction } = req.body;
      const [existing] = await db
        .select()
        .from(directMessages)
        .where(eq(directMessages.id, messageId))
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Message not found" });
      const conversation = await storage.getConversationById(
        existing.conversationId,
      );
      if (
        !conversation?.participants.some(
          (participant) => participant.userId === req.dbUser!.id,
        )
      )
        return res
          .status(403)
          .json({ message: "You are not a participant in this conversation" });

      const updatedMessage = await storage.addReactionToMessage(
        messageId,
        req.dbUser!.id,
        reaction,
      );
      res.json(updatedMessage);
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ message: "Failed to add reaction" });
    }
  });

  // Mark conversation as read
  app.patch(
    "/api/conversations/:conversationId/read",
    attachUser,
    async (req, res) => {
      try {
        const conversationId = parseInt(req.params.conversationId);
        const conversation = await storage.getConversationById(conversationId);
        if (
          !conversation?.participants.some(
            (participant) => participant.userId === req.dbUser!.id,
          )
        ) {
          return res.status(403).json({
            message: "You are not a participant in this conversation",
          });
        }
        await storage.markConversationAsRead(conversationId, req.dbUser!.id);
        res.json({ success: true });
      } catch (error) {
        console.error("Error marking conversation as read:", error);
        res
          .status(500)
          .json({ message: "Failed to mark conversation as read" });
      }
    },
  );

  // Delete a conversation
  app.delete(
    "/api/conversations/:conversationId",
    attachUser,
    async (req, res) => {
      try {
        const conversationId = parseInt(req.params.conversationId);
        const conversation = await storage.getConversationById(conversationId);
        if (
          !conversation?.participants.some(
            (participant) => participant.userId === req.dbUser!.id,
          )
        )
          return res.status(403).json({
            message: "You are not a participant in this conversation",
          });
        console.log(`Attempting to delete conversation ${conversationId}`);

        // This will cascade delete all participants and messages due to DB constraints
        await storage.deleteConversation(conversationId);

        console.log(`Successfully deleted conversation ${conversationId}`);
        res.status(200).json({ success: true });
      } catch (error) {
        console.error("Error deleting conversation:", error);
        res.status(500).json({ message: "Failed to delete conversation" });
      }
    },
  );

  // Get unread message count for a user
  app.get("/api/users/:userId/unread-count", attachUser, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (userId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You can only access your own unread count" });
      const count = await storage.getUnreadMessageCountForUser(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ message: "Failed to get unread message count" });
    }
  });

  // Notification routes
  // Get notifications for a user
  app.get("/api/users/:userId/notifications", attachUser, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (userId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You can only access your own notifications" });
      const notifications = await storage.getNotificationsByUserId(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Create a notification
  app.post("/api/notifications", attachUser, async (req, res) => {
    try {
      if (
        req.body?.userId !== undefined &&
        Number(req.body.userId) !== req.dbUser!.id
      )
        return res
          .status(403)
          .json({ message: "You can only create notifications for yourself" });
      const notification = await storage.createNotification({
        ...req.body,
        userId: req.dbUser!.id,
        read: false,
      });
      res.status(201).json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  // Mark a notification as read
  app.patch(
    "/api/notifications/:id/mark-read",
    attachUser,
    async (req, res) => {
      try {
        const [existing] = await db
          .select()
          .from(notifications)
          .where(eq(notifications.id, req.params.id))
          .limit(1);
        if (!existing)
          return res.status(404).json({ message: "Notification not found" });
        if (existing.userId !== req.dbUser!.id)
          return res
            .status(403)
            .json({ message: "You can only update your own notifications" });
        const notification = await storage.markNotificationAsRead(
          req.params.id,
        );
        res.json(notification);
      } catch (error) {
        console.error("Error marking notification as read:", error);
        res
          .status(500)
          .json({ message: "Failed to mark notification as read" });
      }
    },
  );

  // Mark all notifications as read for a user
  app.patch(
    "/api/users/:userId/notifications/mark-all-read",
    attachUser,
    async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        if (userId !== req.dbUser!.id)
          return res
            .status(403)
            .json({ message: "You can only update your own notifications" });
        await storage.markAllNotificationsAsRead(userId);
        res.status(200).json({ message: "All notifications marked as read" });
      } catch (error) {
        console.error("Error marking all notifications as read:", error);
        res
          .status(500)
          .json({ message: "Failed to mark all notifications as read" });
      }
    },
  );

  // Delete a notification
  app.delete("/api/notifications/:id", attachUser, async (req, res) => {
    try {
      const [existing] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, req.params.id))
        .limit(1);
      if (!existing)
        return res.status(404).json({ message: "Notification not found" });
      if (existing.userId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You can only delete your own notifications" });
      await storage.deleteNotification(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // Delete all notifications for a user
  app.delete(
    "/api/users/:userId/notifications",
    attachUser,
    async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        if (userId !== req.dbUser!.id)
          return res
            .status(403)
            .json({ message: "You can only delete your own notifications" });
        await storage.deleteAllNotifications(userId);
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting all notifications:", error);
        res.status(500).json({ message: "Failed to delete all notifications" });
      }
    },
  );

  // Story routes
  // Get all stories
  app.get("/api/stories", async (req, res) => {
    try {
      const stories = await storage.getStories();
      res.json(stories);
    } catch (error) {
      console.error("Error fetching stories:", error);
      res.status(500).json({ message: "Failed to fetch stories" });
    }
  });

  // Get stories by user ID
  app.get("/api/users/:userId/stories", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const stories = await storage.getUserStories(userId);
      res.json(stories);
    } catch (error) {
      console.error("Error fetching user stories:", error);
      res.status(500).json({ message: "Failed to fetch user stories" });
    }
  });

  // Get a specific story by ID
  app.get("/api/stories/:id", async (req, res) => {
    try {
      const storyId = parseInt(req.params.id);
      const story = await storage.getStoryById(storyId);

      if (!story) {
        return res.status(404).json({ message: "Story not found" });
      }

      res.json(story);
    } catch (error) {
      console.error("Error fetching story:", error);
      res.status(500).json({ message: "Failed to fetch story" });
    }
  });

  // Create a new story
  app.post(
    "/api/stories",
    attachUser,
    upload.single("media"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No media file provided" });
        }

        // Derive the acting user from the authenticated session
        const userId = req.dbUser!.id;
        const mediaType = req.body.mediaType || "image";
        const caption = req.body.caption || null;

        const stored = await persistUpload(req.file, userId, "story");
        const mediaUrl = stored.publicUrl;

        // Create story object
        const storyData = {
          userId,
          mediaUrl,
          mediaType,
          caption,
        };

        console.log("Story data to be created:", storyData);

        // Validate and create story
        const validatedData = insertStorySchema.parse(storyData);
        const story = await storage.createStory(validatedData);

        if (process.env.CREATOROS_DEMO_MODE !== "true") {
          try {
            await db.insert(assets).values({
              ownerUserId: userId,
              kind: mediaType,
              storageKey: stored.storageKey,
              publicUrl: mediaUrl,
              mimeType: req.file.mimetype,
              sizeBytes: req.file.size,
              metadata: {
                originalName: req.file.originalname,
                storyId: story.id,
              },
              status: "ready",
            });
          } catch (assetError) {
            console.error(
              "Story published but asset registration failed:",
              assetError,
            );
          }
        }

        console.log("Story created successfully:", story);

        res.status(201).json(story);
      } catch (error) {
        await discardUploadedFiles([req.file]);
        console.error("Error creating story:", error);

        if (error instanceof Error) {
          console.error("Error details:", error.message);
          if (error.stack) {
            console.error("Error stack:", error.stack);
          }
        }

        res.status(400).json({
          message: "Failed to create story",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Delete a story
  app.delete("/api/stories/:id", attachUser, async (req, res) => {
    try {
      const storyId = parseInt(req.params.id);
      const story = await storage.getStoryById(storyId);
      if (!story) return res.status(404).json({ message: "Story not found" });
      if (story.userId !== req.dbUser!.id)
        return res
          .status(403)
          .json({ message: "You can only delete your own stories" });
      console.log(`Manually deleting story ID: ${storyId}`);
      await storage.deleteStory(storyId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({ message: "Failed to delete story" });
    }
  });

  // Increment view count for a story
  app.post("/api/stories/:id/view", attachUser, async (req, res) => {
    try {
      const storyId = parseInt(req.params.id);
      if (!Number.isInteger(storyId)) return res.status(400).json({ message: "Invalid story ID" });
      const story = await storage.getStoryById(storyId);
      if (!story) return res.status(404).json({ message: "Story not found" });

      // Owners inspecting their own story are not audience views.
      if (!shouldCountStoryView(story.userId, req.dbUser!.id)) return res.json(story);
      if (process.env.CREATOROS_DEMO_MODE === "true") {
        return res.json(await storage.incrementStoryViewCount(storyId));
      }

      const updatedStory = await db.transaction(async (tx) => {
        const [recorded] = await tx.insert(storyViews).values({ storyId, userId: req.dbUser!.id }).onConflictDoNothing().returning({ id: storyViews.id });
        if (!recorded) return story;
        const [updated] = await tx.update(stories).set({ viewCount: sql`${stories.viewCount} + 1` }).where(eq(stories.id, storyId)).returning();
        return updated ?? story;
      });
      res.json(updatedStory);
    } catch (error) {
      console.error("Error incrementing story view count:", error);
      res.status(500).json({ message: "Failed to increment story view count" });
    }
  });

  app.get("/api/users/:id/story-reactions", attachUser, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (req.dbUser!.id !== userId)
      return res.status(403).json({ message: "Not authorized" });
    const reactions = await db
      .select()
      .from(storyReactions)
      .where(eq(storyReactions.userId, userId));
    res.json(reactions);
  });

  app.post("/api/stories/:id/reaction", attachUser, async (req, res) => {
    try {
      const storyId = parseInt(req.params.id);
      const reaction =
        typeof req.body.reaction === "string" ? req.body.reaction : "heart";
      await db
        .insert(storyReactions)
        .values({ userId: req.dbUser!.id, storyId, reaction })
        .onConflictDoUpdate({
          target: [storyReactions.userId, storyReactions.storyId],
          set: { reaction },
        });
      res.status(201).json({ storyId, reaction });
    } catch {
      res.status(500).json({ message: "Failed to react to story" });
    }
  });

  app.delete("/api/stories/:id/reaction", attachUser, async (req, res) => {
    await db
      .delete(storyReactions)
      .where(
        and(
          eq(storyReactions.userId, req.dbUser!.id),
          eq(storyReactions.storyId, parseInt(req.params.id)),
        ),
      );
    res.status(204).send();
  });

  const httpServer = createServer(app);

  return httpServer;
}
