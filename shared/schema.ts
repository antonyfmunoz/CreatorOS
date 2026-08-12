import {
  pgTable,
  text,
  serial,
  integer,
  bigint,
  boolean,
  timestamp,
  json,
  doublePrecision,
  foreignKey,
  uuid,
  unique,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations, sql } from "drizzle-orm";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  // Kept private from public-profile responses. It lets a verified production
  // Clerk account reclaim its existing local profile during the one-time
  // development-to-production identity transition.
  authEmail: text("auth_email").unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  profileLinks: json("profile_links")
    .$type<Array<{ label: string; url: string }>>()
    .notNull()
    .default([]),
  pushNotificationsEnabled: boolean("push_notifications_enabled").notNull().default(true),
  colorMode: text("color_mode").notNull().default("dark"),
  profileImageUrl: text("profile_image_url"),
  role: text("role").default("creator").notNull(),
  status: text("status").default("active").notNull(),
  xpPoints: integer("xp_points").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  clerkId: true,
  authEmail: true,
  username: true,
  displayName: true,
  bio: true,
  profileImageUrl: true,
  role: true,
});

// Account privacy requests are durable because export and erasure must remain
// auditable across restarts. The table stores workflow evidence only; export
// payloads are generated on demand and are never retained here.
export const accountPrivacyRequests = pgTable(
  "account_privacy_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("scheduled"),
    scheduledFor: timestamp("scheduled_for"),
    completedAt: timestamp("completed_at"),
    canceledAt: timestamp("canceled_at"),
    failureCode: text("failure_code"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userKindCreatedIdx: index("account_privacy_user_kind_created_idx").on(
      table.userId,
      table.kind,
      table.createdAt,
    ),
    statusScheduleIdx: index("account_privacy_status_schedule_idx").on(
      table.status,
      table.scheduledFor,
    ),
  }),
);

export const productionBackups = pgTable(
  "production_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dateKey: text("date_key").notNull(),
    status: text("status").notNull().default("running"),
    storageKey: text("storage_key"),
    manifestStorageKey: text("manifest_storage_key"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    sha256: text("sha256"),
    failureCode: text("failure_code"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    dateKeyUnique: uniqueIndex("production_backups_date_key_unique").on(table.dateKey),
    statusStartedIdx: index("production_backups_status_started_idx").on(table.status, table.startedAt),
  }),
);

// Post schema
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  audioUrl: text("audio_url"),
  videoUrl: text("video_url"),
  location: text("location"),
  mediaType: text("media_type").default("text"), // text, photo, audio, video
  repostOfId: integer("repost_of_id"),
  likes: integer("likes").default(0).notNull(),
  comments: integer("comments").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPostSchema = createInsertSchema(posts).pick({
  userId: true,
  content: true,
  imageUrl: true,
  audioUrl: true,
  videoUrl: true,
  location: true,
  mediaType: true,
  repostOfId: true,
});

export const postViews = pgTable(
  "post_views",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  },
  (table) => ({
    postViewerUnique: unique("post_view_post_user_unique").on(
      table.postId,
      table.userId,
    ),
  }),
);

export const postPolls = pgTable(
  "post_polls",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    question: text("question").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ postUnique: unique("post_polls_post_unique").on(table.postId) }),
);

export const postPollOptions = pgTable(
  "post_poll_options",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .references(() => postPolls.id, { onDelete: "cascade" })
      .notNull(),
    body: text("body").notNull(),
    position: integer("position").notNull(),
  },
  (table) => ({ pollPositionUnique: unique("post_poll_option_position_unique").on(table.pollId, table.position) }),
);

export const postPollVotes = pgTable(
  "post_poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .references(() => postPolls.id, { onDelete: "cascade" })
      .notNull(),
    optionId: integer("option_id")
      .references(() => postPollOptions.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ oneVotePerUser: unique("post_poll_vote_user_unique").on(table.pollId, table.userId) }),
);

// A durable, reviewable safety record. Target identifiers remain text so the
// same moderation pipeline can cover posts, messages, and future media types.
export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: integer("reporter_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("open"),
    reviewerUserId: integer("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    reportStatusCreatedIdx: index("content_reports_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    reportTargetIdx: index("content_reports_target_idx").on(
      table.targetType,
      table.targetId,
    ),
  }),
);

// Saved Posts schema - junction table for users and their saved posts
export const savedPosts = pgTable(
  "saved_posts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    savedAt: timestamp("saved_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      // Make sure a user can only save a post once (unique constraint)
      userPostUnique: unique().on(table.userId, table.postId),
    };
  },
);

export const insertSavedPostSchema = createInsertSchema(savedPosts).pick({
  userId: true,
  postId: true,
});

// Account-scoped post reactions. Aggregate counts remain on posts for efficient
// feed rendering, while this table establishes whether a specific account reacted.
export const postLikes = pgTable(
  "post_likes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userPostUnique: unique("post_like_user_post_unique").on(
      table.userId,
      table.postId,
    ),
  }),
);

export const playlists = pgTable("playlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const playlistPosts = pgTable(
  "playlist_posts",
  {
    id: serial("id").primaryKey(),
    playlistId: uuid("playlist_id")
      .references(() => playlists.id, { onDelete: "cascade" })
      .notNull(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => ({
    playlistPostUnique: unique("playlist_post_unique").on(
      table.playlistId,
      table.postId,
    ),
  }),
);

export const distributionJobs = pgTable("distribution_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  format: text("format").notNull(),
  platforms: json("platforms").$type<string[]>().notNull(),
  assetIds: json("asset_ids").$type<string[]>().notNull().default([]),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Provider credentials never appear in client responses. OAuth adapters store
// only encrypted token material here once a platform is approved and enabled.
export const socialConnections = pgTable(
  "social_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerAccountName: text("provider_account_name").notNull(),
    status: text("status").notNull().default("pending"),
    scopes: json("scopes").$type<string[]>().notNull().default([]),
    accessTokenCiphertext: text("access_token_ciphertext"),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    tokenExpiresAt: timestamp("token_expires_at"),
    lastValidatedAt: timestamp("last_validated_at"),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    providerAccountUnique: unique(
      "social_connection_provider_account_unique",
    ).on(table.provider, table.providerAccountId),
    userProviderIndex: index("social_connection_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
  }),
);

// OAuth state is stored as a one-way hash so the browser-only state value is
// single-use, expires quickly, and cannot be recovered from the database.
export const socialOAuthStates = pgTable(
  "social_oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    stateHash: text("state_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    stateHashUnique: unique("social_oauth_states_state_hash_unique").on(
      table.stateHash,
    ),
    providerUserIndex: index("social_oauth_states_provider_user_idx").on(
      table.provider,
      table.userId,
    ),
  }),
);

// Canonical provider connection used by the Relationship Hub. Publishing-only
// socialConnections remain available during migration, but new messaging,
// email, telephony, community, and native adapters all target this contract.
export const relationshipChannelConnections = pgTable(
  "relationship_channel_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    connectedByUserId: integer("connected_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerAccountName: text("provider_account_name").notNull(),
    status: text("status").notNull().default("pending"),
    scopes: json("scopes").$type<string[]>().notNull().default([]),
    capabilities: json("capabilities")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    accessTokenCiphertext: text("access_token_ciphertext"),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    webhookSecretCiphertext: text("webhook_secret_ciphertext"),
    tokenExpiresAt: timestamp("token_expires_at"),
    lastValidatedAt: timestamp("last_validated_at"),
    lastInboundAt: timestamp("last_inbound_at"),
    lastOutboundAt: timestamp("last_outbound_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessProviderAccountUnique: unique(
      "relationship_channel_connections_business_provider_account_unique",
    ).on(table.businessId, table.provider, table.providerAccountId),
    businessProviderIdx: index(
      "relationship_channel_connections_business_provider_idx",
    ).on(table.businessId, table.provider, table.status),
  }),
);

// A relationship is the tenant-owned CRM subject. It can be backed by zero or
// more verified external identities and never requires a CreativesOS account.
export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ownerUserId: integer("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    relationshipType: text("relationship_type").notNull().default("person"),
    lifecycleStage: text("lifecycle_stage").notNull().default("new"),
    status: text("status").notNull().default("active"),
    source: text("source").notNull().default("manual"),
    locale: text("locale"),
    timezone: text("timezone"),
    aiSummary: text("ai_summary"),
    customFields: json("custom_fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastInteractionAt: timestamp("last_interaction_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => ({
    businessUpdatedIdx: index("relationships_business_updated_idx").on(
      table.businessId,
      table.updatedAt,
    ),
    businessOwnerIdx: index("relationships_business_owner_idx").on(
      table.businessId,
      table.ownerUserId,
      table.status,
    ),
  }),
);

export const relationshipExternalIdentities = pgTable(
  "relationship_external_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id").references(
      () => relationshipChannelConnections.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").notNull(),
    providerSubjectId: text("provider_subject_id").notNull(),
    address: text("address"),
    username: text("username"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    verificationStatus: text("verification_status").notNull().default("observed"),
    verifiedAt: timestamp("verified_at"),
    lastSeenAt: timestamp("last_seen_at"),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessProviderSubjectUnique: unique(
      "relationship_external_identities_business_provider_subject_unique",
    ).on(table.businessId, table.provider, table.providerSubjectId),
    relationshipIdx: index("relationship_external_identities_relationship_idx").on(
      table.businessId,
      table.relationshipId,
    ),
  }),
);

export const relationshipMergeCandidates = pgTable(
  "relationship_merge_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    sourceRelationshipId: uuid("source_relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    targetRelationshipId: uuid("target_relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    reason: text("reason").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    evidence: json("evidence").$type<Array<Record<string, unknown>>>().notNull().default([]),
    status: text("status").notNull().default("suggested"),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pairUnique: unique("relationship_merge_candidates_pair_unique").on(
      table.businessId,
      table.sourceRelationshipId,
      table.targetRelationshipId,
    ),
  }),
);

export const relationshipConsents = pgTable(
  "relationship_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    externalIdentityId: uuid("external_identity_id").references(
      () => relationshipExternalIdentities.id,
      { onDelete: "set null" },
    ),
    purpose: text("purpose").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("unknown"),
    source: text("source").notNull().default("observed"),
    disclosureVersion: text("disclosure_version"),
    grantedAt: timestamp("granted_at"),
    expiresAt: timestamp("expires_at"),
    withdrawnAt: timestamp("withdrawn_at"),
    evidence: json("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipPurposeIdx: index("relationship_consents_relationship_purpose_idx").on(
      table.businessId,
      table.relationshipId,
      table.channel,
      table.purpose,
    ),
  }),
);

export const relationshipTags = pgTable(
  "relationship_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique("relationship_tags_business_name_unique").on(
      table.businessId,
      table.name,
    ),
  }),
);

export const relationshipTagAssignments = pgTable(
  "relationship_tag_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => relationshipTags.id, { onDelete: "cascade" })
      .notNull(),
    assignedByUserId: integer("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipTagUnique: unique("relationship_tag_assignments_unique").on(
      table.relationshipId,
      table.tagId,
    ),
  }),
);

export const relationshipNotes = pgTable(
  "relationship_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    visibility: text("visibility").notNull().default("team"),
    sourceType: text("source_type").notNull().default("human"),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipCreatedIdx: index("relationship_notes_relationship_created_idx").on(
      table.businessId,
      table.relationshipId,
      table.createdAt,
    ),
  }),
);

export const relationshipTasks = pgTable(
  "relationship_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedToUserId: integer("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessAssigneeStatusIdx: index("relationship_tasks_assignee_status_idx").on(
      table.businessId,
      table.assignedToUserId,
      table.status,
      table.dueAt,
    ),
  }),
);

export const relationshipConversations = pgTable(
  "relationship_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id").references(() => relationships.id, {
      onDelete: "set null",
    }),
    nativeConversationId: integer("native_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("direct"),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    queue: text("queue").notNull().default("unassigned"),
    assignedToUserId: integer("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    aiMode: text("ai_mode").notNull().default("observe"),
    lastMessageAt: timestamp("last_message_at"),
    snoozedUntil: timestamp("snoozed_until"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    nativeConversationUnique: unique("relationship_conversations_native_unique").on(
      table.businessId,
      table.nativeConversationId,
    ),
    businessQueueUpdatedIdx: index("relationship_conversations_queue_updated_idx").on(
      table.businessId,
      table.queue,
      table.status,
      table.updatedAt,
    ),
  }),
);

export const relationshipConversationBindings = pgTable(
  "relationship_conversation_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => relationshipConversations.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id").references(
      () => relationshipChannelConnections.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").notNull(),
    externalThreadId: text("external_thread_id").notNull(),
    status: text("status").notNull().default("active"),
    capabilities: json("capabilities")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    externalThreadUnique: unique("relationship_conversation_bindings_thread_unique").on(
      table.businessId,
      table.provider,
      table.connectionId,
      table.externalThreadId,
    ),
  }),
);

export const relationshipConversationParticipants = pgTable(
  "relationship_conversation_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => relationshipConversations.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id").references(() => relationships.id, {
      onDelete: "set null",
    }),
    externalIdentityId: uuid("external_identity_id").references(
      () => relationshipExternalIdentities.id,
      { onDelete: "set null" },
    ),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    role: text("role").notNull().default("customer"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
  },
  (table) => ({
    conversationParticipantIdx: index("relationship_conversation_participants_idx").on(
      table.businessId,
      table.conversationId,
    ),
  }),
);

export const relationshipMessages = pgTable(
  "relationship_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => relationshipConversations.id, { onDelete: "cascade" })
      .notNull(),
    bindingId: uuid("binding_id").references(
      () => relationshipConversationBindings.id,
      { onDelete: "set null" },
    ),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorExternalIdentityId: uuid("author_external_identity_id").references(
      () => relationshipExternalIdentities.id,
      { onDelete: "set null" },
    ),
    provider: text("provider").notNull(),
    externalMessageId: text("external_message_id"),
    direction: text("direction").notNull(),
    authorType: text("author_type").notNull(),
    messageType: text("message_type").notNull().default("text"),
    body: text("body").notNull().default(""),
    bodyFormat: text("body_format").notNull().default("plain"),
    replyToMessageId: uuid("reply_to_message_id"),
    status: text("status").notNull().default("received"),
    syntheticMedia: boolean("synthetic_media").notNull().default(false),
    disclosure: text("disclosure"),
    occurredAt: timestamp("occurred_at").notNull(),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    bindingExternalMessageUnique: unique(
      "relationship_messages_binding_external_unique",
    ).on(table.bindingId, table.externalMessageId),
    conversationOccurredIdx: index("relationship_messages_conversation_occurred_idx").on(
      table.businessId,
      table.conversationId,
      table.occurredAt,
    ),
  }),
);

export const relationshipMessageAttachments = pgTable(
  "relationship_message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id")
      .references(() => relationshipMessages.id, { onDelete: "cascade" })
      .notNull(),
    attachmentType: text("attachment_type").notNull(),
    storageKey: text("storage_key"),
    providerMediaId: text("provider_media_id"),
    sourceUrl: text("source_url"),
    filename: text("filename"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    durationMs: integer("duration_ms"),
    checksum: text("checksum"),
    scanStatus: text("scan_status").notNull().default("pending"),
    expiresAt: timestamp("expires_at"),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    messageIdx: index("relationship_message_attachments_message_idx").on(
      table.businessId,
      table.messageId,
    ),
  }),
);

export const relationshipMessageReceipts = pgTable(
  "relationship_message_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id")
      .references(() => relationshipMessages.id, { onDelete: "cascade" })
      .notNull(),
    receiptType: text("receipt_type").notNull(),
    providerReceiptId: text("provider_receipt_id"),
    occurredAt: timestamp("occurred_at").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    messageReceiptIdx: index("relationship_message_receipts_message_idx").on(
      table.businessId,
      table.messageId,
      table.occurredAt,
    ),
  }),
);

export const relationshipConversationNotes = pgTable(
  "relationship_conversation_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => relationshipConversations.id, { onDelete: "cascade" })
      .notNull(),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    sourceType: text("source_type").notNull().default("human"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationCreatedIdx: index("relationship_conversation_notes_created_idx").on(
      table.businessId,
      table.conversationId,
      table.createdAt,
    ),
  }),
);

// Provider events are normalized before automation or AI processing. The raw
// payload belongs in short-retention private storage; rawStorageKey is a pointer
// rather than a reason to retain personal webhook payloads indefinitely.
export const relationshipProviderEvents = pgTable(
  "relationship_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id")
      .references(() => relationshipChannelConnections.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    normalizedPayload: json("normalized_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    rawStorageKey: text("raw_storage_key"),
    status: text("status").notNull().default("received"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    occurredAt: timestamp("occurred_at").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => ({
    connectionEventUnique: unique("relationship_provider_events_external_unique").on(
      table.connectionId,
      table.externalEventId,
    ),
    dueIdx: index("relationship_provider_events_due_idx").on(
      table.status,
      table.nextAttemptAt,
      table.receivedAt,
    ),
  }),
);

export const relationshipDeliveryJobs = pgTable(
  "relationship_delivery_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id")
      .references(() => relationshipChannelConnections.id, { onDelete: "restrict" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => relationshipConversations.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id")
      .references(() => relationshipMessages.id, { onDelete: "cascade" })
      .notNull(),
    actionType: text("action_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    claimedAt: timestamp("claimed_at"),
    claimedBy: text("claimed_by"),
    providerRequestId: text("provider_request_id"),
    providerMessageId: text("provider_message_id"),
    errorClass: text("error_class"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    idempotencyUnique: unique("relationship_delivery_jobs_idempotency_unique").on(
      table.businessId,
      table.idempotencyKey,
    ),
    dueIdx: index("relationship_delivery_jobs_due_idx").on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
  }),
);

// Bridges canonical delivery idempotency to the legacy native DM row while the
// native inbox is migrated onto relationshipMessages. It prevents a local DM
// from being duplicated if the process crashes after insertion but before the
// canonical delivery job is acknowledged.
export const relationshipNativeDeliveryReceipts = pgTable(
  "relationship_native_delivery_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    directMessageId: integer("direct_message_id")
      .references(() => directMessages.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessKeyUnique: unique("relationship_native_delivery_business_key_unique").on(
      table.businessId,
      table.idempotencyKey,
    ),
  }),
);

export const relationshipSyncCursors = pgTable(
  "relationship_sync_cursors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id")
      .references(() => relationshipChannelConnections.id, { onDelete: "cascade" })
      .notNull(),
    stream: text("stream").notNull(),
    cursor: text("cursor"),
    status: text("status").notNull().default("active"),
    lastSyncedAt: timestamp("last_synced_at"),
    nextSyncAt: timestamp("next_sync_at"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    connectionStreamUnique: unique("relationship_sync_cursors_stream_unique").on(
      table.connectionId,
      table.stream,
    ),
  }),
);

export const relationshipAgentAuthorityPolicies = pgTable(
  "relationship_agent_authority_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    agentKey: text("agent_key").notNull(),
    role: text("role").notNull(),
    mode: text("mode").notNull().default("observe"),
    allowedActions: json("allowed_actions").$type<string[]>().notNull().default([]),
    approvalRequiredActions: json("approval_required_actions")
      .$type<string[]>()
      .notNull()
      .default([]),
    blockedActions: json("blocked_actions").$type<string[]>().notNull().default([]),
    channelAllowlist: json("channel_allowlist").$type<string[]>().notNull().default([]),
    maxCostUnitsPerRun: integer("max_cost_units_per_run").notNull().default(100),
    instructions: text("instructions").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessAgentUnique: unique("relationship_agent_authority_business_agent_unique").on(
      table.businessId,
      table.agentKey,
    ),
  }),
);

export const relationshipMemoryFacts = pgTable(
  "relationship_memory_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    factType: text("fact_type").notNull(),
    value: json("value").$type<unknown>().notNull(),
    epistemicStatus: text("epistemic_status").notNull().default("inferred"),
    confidence: doublePrecision("confidence"),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    status: text("status").notNull().default("proposed"),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipStatusIdx: index("relationship_memory_facts_status_idx").on(
      table.businessId,
      table.relationshipId,
      table.status,
    ),
  }),
);

export const relationshipAgentSuggestions = pgTable(
  "relationship_agent_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id").references(
      () => relationshipConversations.id,
      { onDelete: "cascade" },
    ),
    relationshipId: uuid("relationship_id").references(() => relationships.id, {
      onDelete: "cascade",
    }),
    agentKey: text("agent_key").notNull(),
    suggestionType: text("suggestion_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidence: json("evidence").$type<Array<Record<string, unknown>>>().notNull().default([]),
    confidence: doublePrecision("confidence"),
    status: text("status").notNull().default("proposed"),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationStatusIdx: index("relationship_agent_suggestions_status_idx").on(
      table.businessId,
      table.conversationId,
      table.status,
      table.createdAt,
    ),
  }),
);

// Voice profiles contain provider references only. Training samples and output
// media live in private object storage under explicit retention policies.
export const relationshipVoiceProfiles = pgTable(
  "relationship_voice_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    providerVoiceIdCiphertext: text("provider_voice_id_ciphertext"),
    displayName: text("display_name").notNull(),
    cloneType: text("clone_type").notNull().default("professional"),
    status: text("status").notNull().default("enrollment_required"),
    ownershipVerificationStatus: text("ownership_verification_status")
      .notNull()
      .default("unverified"),
    ownershipVerifiedAt: timestamp("ownership_verified_at"),
    disclosureText: text("disclosure_text")
      .notNull()
      .default("AI-generated voice message sent with the voice owner's authorization."),
    allowedUseCases: json("allowed_use_cases").$type<string[]>().notNull().default([]),
    blockedUseCases: json("blocked_use_cases").$type<string[]>().notNull().default([]),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    businessOwnerNameUnique: unique("relationship_voice_profiles_owner_name_unique").on(
      table.businessId,
      table.ownerUserId,
      table.displayName,
    ),
  }),
);

export const relationshipVoiceConsents = pgTable(
  "relationship_voice_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    voiceProfileId: uuid("voice_profile_id")
      .references(() => relationshipVoiceProfiles.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    consentVersion: text("consent_version").notNull(),
    consentTextHash: text("consent_text_hash").notNull(),
    status: text("status").notNull().default("granted"),
    verificationEvidence: json("verification_evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
    withdrawnAt: timestamp("withdrawn_at"),
  },
  (table) => ({
    profileVersionUnique: unique("relationship_voice_consents_profile_version_unique").on(
      table.voiceProfileId,
      table.consentVersion,
    ),
  }),
);

export const relationshipVoiceGenerationJobs = pgTable(
  "relationship_voice_generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    voiceProfileId: uuid("voice_profile_id")
      .references(() => relationshipVoiceProfiles.id, { onDelete: "restrict" })
      .notNull(),
    conversationId: uuid("conversation_id").references(
      () => relationshipConversations.id,
      { onDelete: "set null" },
    ),
    requestedByUserId: integer("requested_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    approvedByUserId: integer("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceType: text("source_type").notNull().default("human"),
    sourceId: text("source_id"),
    scriptCiphertext: text("script_ciphertext").notNull(),
    scriptHash: text("script_hash").notNull(),
    status: text("status").notNull().default("awaiting_approval"),
    providerRequestId: text("provider_request_id"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    durationMs: integer("duration_ms"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    provenance: json("provenance").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    expiresAt: timestamp("expires_at"),
  },
  (table) => ({
    businessStatusIdx: index("relationship_voice_generation_status_idx").on(
      table.businessId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const relationshipAuditEvents = pgTable(
  "relationship_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    correlationId: uuid("correlation_id").defaultRandom().notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessCreatedIdx: index("relationship_audit_events_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
    targetIdx: index("relationship_audit_events_target_idx").on(
      table.businessId,
      table.targetType,
      table.targetId,
    ),
  }),
);

// Business-scoped controls keep Relationship Hub cost and data handling
// predictable without blocking inbound customer contact. Limits are metered
// independently from Stripe so billing providers can change without changing
// product authority.
export const relationshipTenantPolicies = pgTable(
  "relationship_tenant_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    planKey: text("plan_key").notNull().default("foundation"),
    enforcementMode: text("enforcement_mode").notNull().default("enforce"),
    monthlyOutboundMessages: integer("monthly_outbound_messages").notNull().default(10_000),
    monthlyAiRuns: integer("monthly_ai_runs").notNull().default(1_000),
    monthlyVoiceSeconds: integer("monthly_voice_seconds").notNull().default(3_600),
    monthlyRealtimeMinutes: integer("monthly_realtime_minutes").notNull().default(600),
    maxActiveConnections: integer("max_active_connections").notNull().default(10),
    providerPayloadRetentionDays: integer("provider_payload_retention_days").notNull().default(30),
    auditRetentionDays: integer("audit_retention_days").notNull().default(365),
    realtimeArtifactRetentionDays: integer("realtime_artifact_retention_days").notNull().default(30),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export const relationshipUsageLedger = pgTable(
  "relationship_usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    metric: text("metric").notNull(),
    quantity: integer("quantity").notNull().default(1),
    costUnits: integer("cost_units").notNull().default(0),
    provider: text("provider"),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    periodStart: timestamp("period_start").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessKeyUnique: unique("relationship_usage_business_key_unique").on(
      table.businessId,
      table.idempotencyKey,
    ),
    businessPeriodMetricIdx: index("relationship_usage_period_metric_idx").on(
      table.businessId,
      table.periodStart,
      table.metric,
    ),
  }),
);

// Short-lived quota reservations close the gap between checking capacity and
// completing provider work. Active reservations count against the tenant's
// allowance; they are finalized into the immutable usage ledger or released
// after a failed/expired operation.
export const relationshipUsageReservations = pgTable(
  "relationship_usage_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    metric: text("metric").notNull(),
    quantity: integer("quantity").notNull().default(1),
    status: text("status").notNull().default("reserved"),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    periodStart: timestamp("period_start").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessKeyUnique: unique("relationship_usage_reservation_business_key_unique").on(
      table.businessId,
      table.idempotencyKey,
    ),
    activeCapacityIdx: index("relationship_usage_reservation_capacity_idx").on(
      table.businessId,
      table.periodStart,
      table.metric,
      table.status,
      table.expiresAt,
    ),
  }),
);

export const relationshipOperationalAlerts = pgTable(
  "relationship_operational_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    severity: text("severity").notNull().default("warning"),
    category: text("category").notNull(),
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status").notNull().default("open"),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessFingerprintUnique: unique("relationship_alert_business_fingerprint_unique").on(
      table.businessId,
      table.fingerprint,
    ),
    businessStatusIdx: index("relationship_alert_business_status_idx").on(
      table.businessId,
      table.status,
      table.severity,
    ),
  }),
);

// This is the narrow bridge between the governed community-room runtime and
// CRM context. The room still owns media/consent/session state; Relationship
// Hub owns who the meeting is with and which conversation it advances.
export const relationshipRoomBindings = pgTable(
  "relationship_room_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id").references(
      () => relationshipConversations.id,
      { onDelete: "set null" },
    ),
    purpose: text("purpose").notNull().default("relationship_meeting"),
    contextPolicy: json("context_policy")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({ includeTimeline: true, includePrivateNotes: false }),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipRoomIdx: index("relationship_room_binding_relationship_idx").on(
      table.businessId,
      table.relationshipId,
      table.createdAt,
    ),
  }),
);

// One row per requested external destination. This makes a multi-channel job
// auditable and retry-safe, without pretending that a native publish completed
// on a third-party network.
export const distributionDeliveryAttempts = pgTable(
  "distribution_delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    distributionJobId: uuid("distribution_job_id")
      .references(() => distributionJobs.id, { onDelete: "cascade" })
      .notNull(),
    connectionId: uuid("connection_id").references(() => socialConnections.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("waiting_for_connection"),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerContentId: text("provider_content_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    nextAttemptAt: timestamp("next_attempt_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    jobProviderUnique: unique("distribution_delivery_job_provider_unique").on(
      table.distributionJobId,
      table.provider,
    ),
    deliveryStatusIndex: index("distribution_delivery_status_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
  }),
);

// Comment schema
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  parentId: integer("parent_id"),
  content: text("content").notNull(),
  likes: integer("likes").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  postId: true,
  userId: true,
  parentId: true,
  content: true,
});

// Product schema
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "restrict",
  }),
  // A course or offer can grant access to one owned community. The product
  // entitlement remains the source of truth; membership is the local access
  // projection that makes the community usable immediately after settlement.
  communityId: integer("community_id").references(() => communities.id, {
    onDelete: "set null",
  }),
  // Platform offers are collected as CreativesOS revenue. Creator offers use
  // the owner's Stripe Connect account and are deliberately gated until that
  // account can accept charges and payouts.
  payoutMode: text("payout_mode").notNull().default("platform"),
  // Offers are prepared privately first. Existing rows are backfilled as
  // published so this lifecycle never takes a live offer offline.
  status: text("status").notNull().default("draft"),
  // MVP commerce is deliberately limited to the four offer types that close
  // the creator acquisition -> access -> revenue loop. Later product types use
  // separate additive tables instead of overloading category labels.
  productType: text("product_type").notNull().default("digital_download"),
  billingModel: text("billing_model").notNull().default("one_time"),
  billingInterval: text("billing_interval"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: doublePrecision("price").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  rating: doublePrecision("rating").default(0).notNull(),
  reviewCount: integer("review_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).pick({
  userId: true,
  title: true,
  description: true,
  price: true,
  category: true,
  imageUrl: true,
});

// Saves are an account-owned discovery signal. They are deliberately distinct
// from cart and purchase records so a person can organize an offer before any
// commerce action happens.
export const productSaves = pgTable(
  "product_saves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userProductUnique: unique("product_save_user_product_unique").on(
      table.userId,
      table.productId,
    ),
    userCreatedIndex: index("product_save_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

// A signed-in cart is account-owned so it survives reloads and device changes.
// Product details and prices are always rejoined from the catalog rather than
// trusting browser snapshots.
export const shoppingCartItems = pgTable(
  "shopping_cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userProductUnique: unique("shopping_cart_user_product_unique").on(
      table.userId,
      table.productId,
    ),
    userCreatedIndex: index("shopping_cart_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

// Reviews are purchase-gated. The verification flag is a durable snapshot so a
// later refund or entitlement change does not rewrite historical trust signals.
export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull().default(""),
    isVerifiedPurchase: boolean("is_verified_purchase").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userProductUnique: unique("product_reviews_user_product_unique").on(
      table.userId,
      table.productId,
    ),
  }),
);

export const courseProgress = pgTable(
  "course_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    lessonId: text("lesson_id").notNull(),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => ({
    userCourseLessonUnique: unique(
      "course_progress_user_product_lesson_unique",
    ).on(table.userId, table.productId, table.lessonId),
  }),
);

// A course offer owns an editable curriculum. Lessons deliberately store their
// instructional body and provider-neutral media URL separately so an R2/video
// provider can be connected later without changing course delivery semantics.
export const courseModules = pgTable("course_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: integer("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const courseLessons = pgTable("course_lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: uuid("module_id")
    .references(() => courseModules.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  videoUrl: text("video_url"),
  resourceUrls: json("resource_urls").$type<string[]>().notNull().default([]),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  // Number of full days after enrollment before a learner can open this lesson.
  // A value of zero makes the lesson available as soon as it is published.
  availableAfterDays: integer("available_after_days").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CourseAssessmentQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
};

// One lightweight, provider-neutral assessment may be attached to a lesson.
// The answer key is never sent to learners; attempts retain a score/audit trail.
export const courseAssessments = pgTable("course_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  lessonId: uuid("lesson_id")
    .references(() => courseLessons.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  passingScorePercent: integer("passing_score_percent").notNull().default(70),
  questions: json("questions")
    .$type<CourseAssessmentQuestion[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const courseAssessmentAttempts = pgTable(
  "course_assessment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .references(() => courseAssessments.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    scorePercent: integer("score_percent").notNull(),
    passed: boolean("passed").notNull(),
    answers: json("answers")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
  },
  (table) => ({
    assessmentUserCompletedIdx: index(
      "course_assessment_attempts_assessment_user_completed_idx",
    ).on(table.assessmentId, table.userId, table.completedAt),
  }),
);

// Purchase / entitlement schema. Payment providers create these records only
// after a verified payment; demo mode uses the same entitlement path with a
// clearly marked demo provider so the MVP can be exercised end-to-end.
export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    buyerId: integer("buyer_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").default("active").notNull(),
    paymentProvider: text("payment_provider").default("demo").notNull(),
    purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  },
  (table) => ({
    buyerProductUnique: unique("buyer_product_unique").on(
      table.buyerId,
      table.productId,
    ),
  }),
);

export const insertPurchaseSchema = createInsertSchema(purchases).pick({
  buyerId: true,
  productId: true,
  status: true,
  paymentProvider: true,
});

// Provider-neutral commerce records. A payment adapter settles an order; the
// entitlement remains the sole source of truth for access decisions.
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerId: integer("buyer_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "restrict",
  }),
  status: text("status").notNull().default("pending"),
  currency: text("currency").notNull().default("usd"),
  subtotalAmount: doublePrecision("subtotal_amount").notNull().default(0),
  totalAmount: doublePrecision("total_amount").notNull().default(0),
  paymentProvider: text("payment_provider"),
  providerReference: text("provider_reference"),
  // The Checkout Session identifies the buyer-facing flow while the payment
  // reference identifies the durable Stripe money object used by refunds and
  // disputes. Keeping both prevents a later financial event from being
  // matched by amount or customer-controlled metadata.
  providerPaymentReference: text("provider_payment_reference"),
  providerSubscriptionReference: text("provider_subscription_reference"),
  subscriptionStatus: text("subscription_status"),
  subscriptionCancelAt: timestamp("subscription_cancel_at"),
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end").notNull().default(false),
  financialStatus: text("financial_status").notNull().default("open"),
  refundedAmount: doublePrecision("refunded_amount").notNull().default(0),
  disputedAmount: doublePrecision("disputed_amount").notNull().default(0),
  lastProviderEventAt: timestamp("last_provider_event_at"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// A creator never supplies an API key to CreativesOS. This record binds their
// local identity to a Stripe Connect account and stores only non-secret status
// returned by Stripe.
export const creatorPaymentAccounts = pgTable("creator_payment_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  stripeAccountId: text("stripe_account_id").notNull().unique(),
  accountType: text("account_type").notNull().default("standard"),
  status: text("status").notNull().default("pending"),
  detailsSubmitted: boolean("details_submitted").notNull().default(false),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  disabledReason: text("disabled_reason"),
  requirementsCurrentlyDue: json("requirements_currently_due").$type<string[]>().notNull().default([]),
  requirementsPastDue: json("requirements_past_due").$type<string[]>().notNull().default([]),
  country: text("country"),
  defaultCurrency: text("default_currency"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One creator-owned order is one seller in the first marketplace release.
// The allocation is an immutable commercial snapshot: it distinguishes the
// buyer's charge, platform fee, and creator earnings even if policies change.
export const creatorEarningsAllocations = pgTable(
  "creator_earnings_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    sellerUserId: integer("seller_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    stripeConnectedAccountId: text("stripe_connected_account_id").notNull(),
    currency: text("currency").notNull().default("usd"),
    grossAmount: doublePrecision("gross_amount").notNull(),
    platformFeeAmount: doublePrecision("platform_fee_amount").notNull(),
    creatorNetAmount: doublePrecision("creator_net_amount").notNull(),
    paymentIntentReference: text("payment_intent_reference"),
    providerEventReference: text("provider_event_reference"),
    status: text("status").notNull().default("payment_required"),
    refundedAmount: doublePrecision("refunded_amount").notNull().default(0),
    disputedAmount: doublePrecision("disputed_amount").notNull().default(0),
    reversedAmount: doublePrecision("reversed_amount").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    orderIdx: index("creator_earnings_allocations_order_id_idx").on(table.orderId),
    providerEventUnique: uniqueIndex("creator_earnings_allocations_provider_event_unique").on(table.providerEventReference),
    pendingOrderUnique: uniqueIndex("creator_earnings_allocations_pending_order_unique")
      .on(table.orderId)
      .where(sql`${table.providerEventReference} is null`),
  }),
);

// Every verified provider event receives one durable processing row before it
// can mutate commerce state. Raw webhook payloads are deliberately not stored;
// the hash, resource references, result and bounded error are enough for
// idempotency, reconciliation and incident response without retaining payment
// data that CreativesOS does not need.
export const commerceProviderEvents = pgTable(
  "commerce_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    livemode: boolean("livemode").notNull().default(false),
    status: text("status").notNull().default("processing"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    connectedAccountId: text("connected_account_id"),
    providerObjectReference: text("provider_object_reference"),
    amount: doublePrecision("amount"),
    currency: text("currency"),
    payloadSha256: text("payload_sha256").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    providerEventUnique: unique("commerce_provider_event_unique").on(table.provider, table.providerEventId),
    orderCreatedIndex: index("commerce_provider_events_order_created_idx").on(table.orderId, table.receivedAt),
    statusUpdatedIndex: index("commerce_provider_events_status_updated_idx").on(table.status, table.updatedAt),
  }),
);

// Payouts are connected-account cash movements rather than order payments, so
// they need their own immutable provider identity and status history. This lets
// creators see whether Stripe has merely scheduled, paid, canceled or failed a
// payout without conflating that state with earnings allocation.
export const creatorPayoutEvents = pgTable(
  "creator_payout_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerUserId: integer("seller_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    stripeConnectedAccountId: text("stripe_connected_account_id").notNull(),
    providerPayoutId: text("provider_payout_id").notNull().unique(),
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    arrivalAt: timestamp("arrival_at"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sellerUpdatedIndex: index("creator_payout_events_seller_updated_idx").on(table.sellerUserId, table.updatedAt),
  }),
);

// OAuth state is one-time, short-lived, and bound to a local creator. The
// authorization code never reaches the client application logic directly.
export const stripeConnectOauthStates = pgTable("stripe_connect_oauth_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  stateHash: text("state_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id, { onDelete: "restrict" })
    .notNull(),
  titleSnapshot: text("title_snapshot").notNull(),
  unitAmount: doublePrecision("unit_amount").notNull(),
  quantity: integer("quantity").notNull().default(1),
  productTypeSnapshot: text("product_type_snapshot").notNull().default("digital_download"),
  billingModelSnapshot: text("billing_model_snapshot").notNull().default("one_time"),
  billingIntervalSnapshot: text("billing_interval_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    sourceOrderId: uuid("source_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at").defaultNow().notNull(),
    endsAt: timestamp("ends_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    entitlementResourceUnique: unique("entitlement_user_resource_unique").on(
      table.userId,
      table.resourceType,
      table.resourceId,
    ),
  }),
);

// AI Agent schema
export const aiAgents = pgTable("ai_agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  iconColor: text("icon_color").notNull(),
  backgroundColor: text("background_color").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  isCustom: boolean("is_custom").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  chatCount: integer("chat_count").default(0).notNull(),
  status: text("status").default("active").notNull(),
});

export const insertAiAgentSchema = createInsertSchema(aiAgents).pick({
  userId: true,
  name: true,
  description: true,
  icon: true,
  iconColor: true,
  backgroundColor: true,
  systemPrompt: true,
  isCustom: true,
});

// AI Chat schema
export const aiChats = pgTable("ai_chats", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .references(() => aiAgents.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  messages: json("messages").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiChatSchema = createInsertSchema(aiChats).pick({
  agentId: true,
  userId: true,
  messages: true,
});

// Provider-neutral conversational automation kernel. External providers can
// supply actions later, while authority, approvals, budgets, and evidence stay
// native to CreativesOS.
export const automationDefinitions = pgTable(
  "automation_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    status: text("status").default("draft").notNull(),
    version: integer("version").default(1).notNull(),
    triggerType: text("trigger_type").default("manual").notNull(),
    triggerConfig: json("trigger_config").$type<Record<string, unknown>>().default({}).notNull(),
    maxRunsPerHour: integer("max_runs_per_hour").default(20).notNull(),
    maxStepsPerRun: integer("max_steps_per_run").default(20).notNull(),
    retentionDays: integer("retention_days").default(90).notNull(),
    lastActivatedAt: timestamp("last_activated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerStatusIdx: index("automation_definitions_owner_status_idx").on(table.ownerUserId, table.status, table.updatedAt),
    businessStatusIdx: index("automation_definitions_business_status_idx").on(table.businessId, table.status),
  }),
);

export const automationSteps = pgTable(
  "automation_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id").references(() => automationDefinitions.id, { onDelete: "cascade" }).notNull(),
    stepKey: text("step_key").notNull(),
    name: text("name").notNull(),
    actionType: text("action_type").notNull(),
    config: json("config").$type<Record<string, unknown>>().default({}).notNull(),
    position: integer("position").notNull(),
    approvalPolicy: text("approval_policy").default("none").notNull(),
    retryLimit: integer("retry_limit").default(2).notNull(),
    timeoutMs: integer("timeout_ms").default(30_000).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    definitionStepKeyUnique: unique("automation_steps_definition_key_unique").on(table.definitionId, table.stepKey),
    definitionPositionUnique: unique("automation_steps_definition_position_unique").on(table.definitionId, table.position),
  }),
);

export const automationTriggerEvents = pgTable(
  "automation_trigger_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: json("payload").$type<Record<string, unknown>>().default({}).notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").default("pending").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    errorMessage: text("error_message"),
  },
  (table) => ({
    statusReceivedIdx: index("automation_trigger_events_status_received_idx").on(table.status, table.receivedAt),
  }),
);

// Provider-neutral messaging consent and delivery state. Native CreativesOS
// conversations use channel="native"; provider adapters can reuse the same
// contract later without changing automation definitions.
export const automationContactStates = pgTable(
  "automation_contact_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    contactUserId: integer("contact_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    channel: text("channel").default("native").notNull(),
    conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    optedOut: boolean("opted_out").default(false).notNull(),
    optedOutAt: timestamp("opted_out_at"),
    lastInboundAt: timestamp("last_inbound_at"),
    lastOutboundAt: timestamp("last_outbound_at"),
    cooldownUntil: timestamp("cooldown_until"),
    metadata: json("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerContactChannelUnique: unique("automation_contact_states_owner_contact_channel_unique").on(table.ownerUserId, table.contactUserId, table.channel),
    ownerUpdatedIdx: index("automation_contact_states_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
  }),
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id").references(() => automationDefinitions.id, { onDelete: "restrict" }).notNull(),
    definitionVersion: integer("definition_version").notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    initiatedByUserId: integer("initiated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    triggerType: text("trigger_type").notNull(),
    triggerEventId: uuid("trigger_event_id").references(() => automationTriggerEvents.id, { onDelete: "set null" }),
    threadId: uuid("thread_id").references((): AnyPgColumn => automationThreads.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").default("queued").notNull(),
    input: json("input").$type<Record<string, unknown>>().default({}).notNull(),
    output: json("output").$type<Record<string, unknown>>().default({}).notNull(),
    currentStepKey: text("current_step_key"),
    stepCount: integer("step_count").default(0).notNull(),
    costUnits: integer("cost_units").default(0).notNull(),
    maxCostUnits: integer("max_cost_units").default(100).notNull(),
    queuedAt: timestamp("queued_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    heartbeatAt: timestamp("heartbeat_at"),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    payloadRedactedAt: timestamp("payload_redacted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusAttemptIdx: index("automation_runs_status_attempt_idx").on(table.status, table.nextAttemptAt),
    definitionCreatedIdx: index("automation_runs_definition_created_idx").on(table.definitionId, table.createdAt),
  }),
);

export const automationStepRuns = pgTable(
  "automation_step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => automationRuns.id, { onDelete: "cascade" }).notNull(),
    stepId: uuid("step_id").references(() => automationSteps.id, { onDelete: "set null" }),
    stepKey: text("step_key").notNull(),
    actionType: text("action_type").notNull(),
    attempt: integer("attempt").default(1).notNull(),
    status: text("status").default("queued").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    input: json("input").$type<Record<string, unknown>>().default({}).notNull(),
    output: json("output").$type<Record<string, unknown>>().default({}).notNull(),
    costUnits: integer("cost_units").default(0).notNull(),
    startedAt: timestamp("started_at"),
    heartbeatAt: timestamp("heartbeat_at"),
    nextAttemptAt: timestamp("next_attempt_at"),
    finishedAt: timestamp("finished_at"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    runStepAttemptIdx: index("automation_step_runs_run_step_attempt_idx").on(table.runId, table.stepKey, table.attempt),
  }),
);

export const automationApprovals = pgTable(
  "automation_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => automationRuns.id, { onDelete: "cascade" }).notNull(),
    stepRunId: uuid("step_run_id").references(() => automationStepRuns.id, { onDelete: "cascade" }).notNull().unique(),
    requestedForUserId: integer("requested_for_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    status: text("status").default("pending").notNull(),
    reason: text("reason").notNull(),
    evidence: json("evidence").$type<Record<string, unknown>>().default({}).notNull(),
    expiresAt: timestamp("expires_at"),
    decidedByUserId: integer("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("automation_approvals_user_status_idx").on(table.requestedForUserId, table.status, table.createdAt),
  }),
);

// A receipt commits the native side effect and its replay result together.
// Recovering the same step after a worker crash therefore returns the original
// resource instead of creating it twice.
export const automationActionReceipts = pgTable(
  "automation_action_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stepRunId: uuid("step_run_id").references(() => automationStepRuns.id, { onDelete: "cascade" }).notNull().unique(),
    actionType: text("action_type").notNull(),
    output: json("output").$type<Record<string, unknown>>().default({}).notNull(),
    summary: text("summary").notNull(),
    costUnits: integer("cost_units").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const automationThreads = pgTable(
  "automation_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id").references(() => automationDefinitions.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => automationRuns.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").default("open").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("automation_threads_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
  }),
);

export const automationMessages = pgTable(
  "automation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").references(() => automationThreads.id, { onDelete: "cascade" }).notNull(),
    authorType: text("author_type").notNull(),
    authorUserId: integer("author_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").default("message").notNull(),
    content: text("content").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    threadCreatedIdx: index("automation_messages_thread_created_idx").on(table.threadId, table.createdAt),
  }),
);

export const automationAuditEvents = pgTable(
  "automation_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    definitionId: uuid("definition_id").references(() => automationDefinitions.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => automationRuns.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runCreatedIdx: index("automation_audit_events_run_created_idx").on(table.runId, table.createdAt),
    actorCreatedIdx: index("automation_audit_events_actor_created_idx").on(table.actorUserId, table.createdAt),
  }),
);

// Community schema
export const communities = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  iconColor: text("icon_color").notNull(),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCommunitySchema = createInsertSchema(communities).pick({
  name: true,
  description: true,
  iconColor: true,
});

export const communityMemberships = pgTable(
  "community_memberships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    communityId: integer("community_id")
      .references(() => communities.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").default("member").notNull(),
    status: text("status").default("active").notNull(),
    moderationReason: text("moderation_reason"),
    moderatedAt: timestamp("moderated_at"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    userCommunityUnique: unique("user_community_unique").on(
      table.userId,
      table.communityId,
    ),
  }),
);

export const insertCommunityMembershipSchema = createInsertSchema(
  communityMemberships,
).pick({
  userId: true,
  communityId: true,
  role: true,
});

export const communityModerationActions = pgTable(
  "community_moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: integer("community_id")
      .references(() => communities.id, { onDelete: "cascade" })
      .notNull(),
    targetUserId: integer("target_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

// A creator can operate independently or through one or more businesses. The
// business is the owner of commerce, distribution, and community operations;
// user profiles remain the public social identity.
export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: integer("owner_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  description: text("description").notNull().default(""),
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("active"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBusinessSchema = createInsertSchema(businesses).pick({
  ownerUserId: true,
  name: true,
  handle: true,
  description: true,
  logoUrl: true,
  status: true,
  isDefault: true,
});

export const businessMembers = pgTable(
  "business_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull().default("operator"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessUserUnique: unique("business_member_business_user_unique").on(
      table.businessId,
      table.userId,
    ),
  }),
);

export const insertBusinessMemberSchema = createInsertSchema(
  businessMembers,
).pick({
  businessId: true,
  userId: true,
  role: true,
});

// Media assets and drafts are first-class records so the composer can survive
// refreshes, scheduling, and later provider hand-off without local-only state.
export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: integer("owner_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "set null",
  }),
  kind: text("kind").notNull(),
  // Storage stays provider-neutral so the projection can move R2/S3 providers
  // without breaking product, draft, or UMH references.
  storageProvider: text("storage_provider").notNull().default("legacy"),
  storageKey: text("storage_key").notNull(),
  publicUrl: text("public_url"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  // Public assets may use the branded CDN; private assets are always served
  // through an authorized, short-lived URL instead of exposing their key.
  visibility: text("visibility").notNull().default("public"),
  status: text("status").notNull().default("ready"),
  originalFilename: text("original_filename"),
  sha256: text("sha256"),
  deleteAfter: timestamp("delete_after"),
  metadata: json("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contentDrafts = pgTable("content_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "set null",
  }),
  kind: text("kind").notNull().default("post"),
  content: text("content").notNull().default(""),
  assetIds: json("asset_ids").$type<string[]>().notNull().default([]),
  audience: text("audience").notNull().default("public"),
  platformVariants: json("platform_variants")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  scheduledFor: timestamp("scheduled_for"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// CutStudio is a standalone-safe projection instrument. Source media and
// renders remain private assets; the database stores the durable edit graph,
// transcript, optimistic revision, and restart-safe processing jobs.
export const cutStudioProjects = pgTable(
  "cut_studio_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    sourceAssetId: uuid("source_asset_id").references(() => assets.id, { onDelete: "restrict" }).notNull(),
    name: text("name").notNull(),
    duration: doublePrecision("duration").notNull(),
    mediaKind: text("media_kind").notNull(),
    edl: json("edl").$type<import("./cut-studio").CutEdl>().notNull(),
    transcript: json("transcript").$type<import("./cut-studio").CutTranscript | null>(),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("cut_studio_projects_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
    businessUpdatedIdx: index("cut_studio_projects_business_updated_idx").on(table.businessId, table.updatedAt),
  }),
);

export const cutStudioJobs = pgTable(
  "cut_studio_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => cutStudioProjects.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("queued"),
    detail: text("detail").notNull().default("Queued"),
    progress: doublePrecision("progress").notNull().default(0),
    request: json("request").$type<Record<string, unknown>>().notNull().default({}),
    output: json("output").$type<Record<string, unknown>>().notNull().default({}),
    artifactAssetId: uuid("artifact_asset_id").references(() => assets.id, { onDelete: "set null" }),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({
    projectCreatedIdx: index("cut_studio_jobs_project_created_idx").on(table.projectId, table.createdAt),
    stateCreatedIdx: index("cut_studio_jobs_state_created_idx").on(table.state, table.createdAt),
  }),
);

export const broadcastStudios = pgTable(
  "broadcast_studios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    config: json("config").$type<import("./broadcast-studio").BroadcastStudioConfig>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({ ownerUpdatedIdx: index("broadcast_studios_owner_updated_idx").on(table.ownerUserId, table.updatedAt) }),
);

export const broadcastDestinations = pgTable(
  "broadcast_destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    protocol: text("protocol").notNull(),
    ingestUrl: text("ingest_url").notNull(),
    streamKeyCiphertext: text("stream_key_ciphertext").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({ ownerUpdatedIdx: index("broadcast_destinations_owner_updated_idx").on(table.ownerUserId, table.updatedAt) }),
);

export const broadcastSessions = pgTable(
  "broadcast_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").references(() => broadcastStudios.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    destinationId: uuid("destination_id").references(() => broadcastDestinations.id, { onDelete: "set null" }),
    destinationIds: json("destination_ids").$type<string[]>().notNull().default([]),
    recordingAssetId: uuid("recording_asset_id").references(() => assets.id, { onDelete: "set null" }),
    outputMode: text("output_mode").notNull(),
    sourceMode: text("source_mode").notNull(),
    state: text("state").notNull().default("starting"),
    runtimeMachineId: text("runtime_machine_id"),
    health: json("health").$type<Record<string, unknown>>().notNull().default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    studioCreatedIdx: index("broadcast_sessions_studio_created_idx").on(table.studioId, table.createdAt),
    ownerCreatedIdx: index("broadcast_sessions_owner_created_idx").on(table.ownerUserId, table.createdAt),
  }),
);

// A private asset can be fulfilled through one or more paid products without
// copying the bytes or exposing a permanent download URL.
export const assetProductAccess = pgTable(
  "asset_product_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    assetProductUnique: unique("asset_product_access_unique").on(
      table.assetId,
      table.productId,
    ),
  }),
);

// Campaigns are the planning and measurement layer above individual posts.
// They intentionally remain provider-neutral: paid media, creator seeding, and
// external channel delivery can attach later without changing a creator's
// operating plan or historical performance data.
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  ownerUserId: integer("owner_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  objective: text("objective").notNull().default("awareness"),
  channel: text("channel").notNull().default("organic"),
  status: text("status").notNull().default("draft"),
  description: text("description").notNull().default(""),
  budgetCents: integer("budget_cents").notNull().default(0),
  targeting: json("targeting")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).pick({
  businessId: true,
  ownerUserId: true,
  name: true,
  objective: true,
  channel: true,
  status: true,
  description: true,
  budgetCents: true,
  targeting: true,
  startsAt: true,
  endsAt: true,
});

export const campaignDeliverables = pgTable("campaign_deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .references(() => campaigns.id, { onDelete: "cascade" })
    .notNull(),
  contentDraftId: uuid("content_draft_id").references(() => contentDrafts.id, {
    onDelete: "set null",
  }),
  distributionJobId: uuid("distribution_job_id").references(
    () => distributionJobs.id,
    { onDelete: "set null" },
  ),
  title: text("title").notNull(),
  channel: text("channel").notNull().default("CreativesOS"),
  status: text("status").notNull().default("planned"),
  dueAt: timestamp("due_at"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Metrics may be entered manually today and attributed by connected providers
// later. Amounts are stored as integer cents to prevent rounding drift.
export const campaignMetrics = pgTable("campaign_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .references(() => campaigns.id, { onDelete: "cascade" })
    .notNull(),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  impressions: integer("impressions").notNull().default(0),
  engagements: integer("engagements").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  spendCents: integer("spend_cents").notNull().default(0),
  attributedRevenueCents: integer("attributed_revenue_cents")
    .notNull()
    .default(0),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Channel schema
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id")
    .references(() => communities.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChannelSchema = createInsertSchema(channels).pick({
  communityId: true,
  name: true,
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  communityId: integer("community_id")
    .references(() => communities.id, { onDelete: "cascade" })
    .notNull(),
  channelId: integer("channel_id").references(() => channels.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  dateTime: timestamp("date_time").notNull(),
  location: text("location"),
  description: text("description").notNull().default(""),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Community rooms are the first-party coordination layer for live sessions.
// Media is deliberately provider-neutral: a room can launch through a managed
// provider today and move to UMH/LiveKit later without changing the community
// or its durable meeting record.
export const communityRooms = pgTable("community_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: integer("community_id")
    .references(() => communities.id, { onDelete: "cascade" })
    .notNull(),
  channelId: integer("channel_id").references(() => channels.id, {
    onDelete: "set null",
  }),
  hostUserId: integer("host_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  startsAt: timestamp("starts_at").notNull(),
  endedAt: timestamp("ended_at"),
  status: text("status").notNull().default("scheduled"),
  provider: text("provider").notNull().default("manual_link"),
  joinUrl: text("join_url"),
  // No room is recorded or transcribed merely because it is live. These flags
  // make consent and the future provider hand-off explicit and auditable.
  recordingConsentRequired: boolean("recording_consent_required")
    .notNull()
    .default(true),
  recordingEnabled: boolean("recording_enabled").notNull().default(false),
  transcriptionEnabled: boolean("transcription_enabled")
    .notNull()
    .default(false),
  aiAssistanceEnabled: boolean("ai_assistance_enabled")
    .notNull()
    .default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const communityRoomNotes = pgTable("community_room_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .references(() => communityRooms.id, { onDelete: "cascade" })
    .notNull(),
  authorUserId: integer("author_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  visibility: text("visibility").notNull().default("members"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const communityRoomActionItems = pgTable("community_room_action_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .references(() => communityRooms.id, { onDelete: "cascade" })
    .notNull(),
  createdByUserId: integer("created_by_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  assigneeUserId: integer("assignee_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// RSVP and attendance belong to the CreativesOS room even when the actual
// call is delivered by an external provider. Provider attendance can enrich
// this record later without making the local community workflow dependent on
// a provider connection.
export const communityRoomAttendees = pgTable(
  "community_room_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull().default("going"),
    checkedInAt: timestamp("checked_in_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    roomUserUnique: unique("community_room_attendee_room_user_unique").on(
      table.roomId,
      table.userId,
    ),
  }),
);

// A room policy declares which intelligence capabilities a host permits. It
// does not activate a provider by itself; external processors must still be
// configured and every capability that listens to participants must pass the
// consent checks below.
export const communityRoomIntelligencePolicies = pgTable(
  "community_room_intelligence_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    updatedByUserId: integer("updated_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    privateCopilotEnabled: boolean("private_copilot_enabled")
      .notNull()
      .default(false),
    visibleAiEnabled: boolean("visible_ai_enabled")
      .notNull()
      .default(false),
    guestBriefsEnabled: boolean("guest_briefs_enabled")
      .notNull()
      .default(false),
    engagementInsightsEnabled: boolean("engagement_insights_enabled")
      .notNull()
      .default(false),
    salesCoachingEnabled: boolean("sales_coaching_enabled")
      .notNull()
      .default(false),
    recordingAllowed: boolean("recording_allowed").notNull().default(false),
    transcriptionAllowed: boolean("transcription_allowed")
      .notNull()
      .default(false),
    aiAnalysisAllowed: boolean("ai_analysis_allowed")
      .notNull()
      .default(false),
    disclosureText: text("disclosure_text")
      .notNull()
      .default(
        "This room may use explicitly enabled AI assistance. Active processing is disclosed before it begins, and you can decline or withdraw consent.",
      ),
    retentionDays: integer("retention_days").notNull().default(30),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

export const communityRoomConsents = pgTable(
  "community_room_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    capability: text("capability").notNull(),
    decision: text("decision").notNull(),
    disclosureVersion: text("disclosure_version")
      .notNull()
      .default("room-intelligence-v1"),
    respondedAt: timestamp("responded_at").defaultNow().notNull(),
    withdrawnAt: timestamp("withdrawn_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    roomUserCapabilityUnique: unique(
      "community_room_consent_room_user_capability_unique",
    ).on(table.roomId, table.userId, table.capability),
  }),
);

export const communityRoomAiProfiles = pgTable(
  "community_room_ai_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    mode: text("mode").notNull(),
    audienceRole: text("audience_role").notNull().default("owner"),
    instructions: text("instructions").notNull().default(""),
    status: text("status").notNull().default("configured"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

// Insights are drafts with evidence and confidence, never hidden facts about a
// person. A human must accept an insight before it becomes a durable note or
// action item.
export const communityRoomInsights = pgTable("community_room_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .references(() => communityRooms.id, { onDelete: "cascade" })
    .notNull(),
  agentProfileId: uuid("agent_profile_id").references(
    () => communityRoomAiProfiles.id,
    { onDelete: "set null" },
  ),
  targetUserId: integer("target_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  insightType: text("insight_type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  evidence: json("evidence").$type<Array<Record<string, unknown>>>().notNull().default([]),
  confidence: doublePrecision("confidence"),
  status: text("status").notNull().default("draft"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at"),
  acceptedNoteId: uuid("accepted_note_id").references(
    () => communityRoomNotes.id,
    { onDelete: "set null" },
  ),
  acceptedActionItemId: uuid("accepted_action_item_id").references(
    () => communityRoomActionItems.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
});

// Provider activity is mirrored into CreativesOS so recordings, transcripts,
// and AI participants remain auditable even when the realtime runtime is
// replaced. Recording objects are always private and are only exposed through
// short-lived, authorized download URLs.
export const communityRoomRecordings = pgTable(
  "community_room_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    requestedByUserId: integer("requested_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    provider: text("provider").notNull().default("livekit_egress"),
    providerRecordingId: text("provider_recording_id").unique(),
    status: text("status").notNull().default("starting"),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull().default("video/mp4"),
    startedAt: timestamp("started_at"),
    stoppedAt: timestamp("stopped_at"),
    durationMs: integer("duration_ms"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    roomCreatedIdx: index("community_room_recordings_room_created_idx").on(
      table.roomId,
      table.createdAt,
    ),
    oneActivePerRoom: uniqueIndex("community_room_recordings_one_active_per_room")
      .on(table.roomId)
      .where(sql`${table.status} in ('starting', 'active', 'stopping')`),
  }),
);

export const communityRoomTranscriptSegments = pgTable(
  "community_room_transcript_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    agentSessionId: uuid("agent_session_id")
      .references(() => communityRoomAgentSessions.id, { onDelete: "cascade" })
      .notNull(),
    providerSegmentId: text("provider_segment_id").notNull(),
    speakerIdentity: text("speaker_identity").notNull(),
    speakerUserId: integer("speaker_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    startTimeMs: integer("start_time_ms"),
    endTimeMs: integer("end_time_ms"),
    isFinal: boolean("is_final").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionSegmentUnique: unique(
      "community_room_transcript_session_segment_unique",
    ).on(table.agentSessionId, table.providerSegmentId),
    roomCreatedIdx: index("community_room_transcript_room_created_idx").on(
      table.roomId,
      table.createdAt,
    ),
  }),
);

export const communityRoomAgentSessions = pgTable(
  "community_room_agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    agentProfileId: uuid("agent_profile_id").references(
      () => communityRoomAiProfiles.id,
      { onDelete: "set null" },
    ),
    startedByUserId: integer("started_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    kind: text("kind").notNull(),
    provider: text("provider").notNull().default("livekit_agents"),
    providerSessionId: text("provider_session_id").unique(),
    status: text("status").notNull().default("starting"),
    startedAt: timestamp("started_at"),
    stoppedAt: timestamp("stopped_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    roomStatusIdx: index("community_room_agent_sessions_room_status_idx").on(
      table.roomId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const eventAttendees = pgTable(
  "event_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .references(() => events.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull().default("going"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    eventUserUnique: unique("event_attendee_event_user_unique").on(
      table.eventId,
      table.userId,
    ),
  }),
);

// The standalone app owns its data; this outbox is its small UMH seed. A
// projection consumer can deliver immutable domain events without the UI or
// domain routes depending on another OS at request time.
export const projectionEvents = pgTable("projection_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projection: text("projection").notNull().default("creativesos"),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  actorUserId: integer("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  payload: json("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  correlationId: text("correlation_id"),
  traceId: text("trace_id"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  nextDeliveryAt: timestamp("next_delivery_at"),
  deliveryLockedAt: timestamp("delivery_locked_at"),
  lastDeliveryError: text("last_delivery_error"),
});

// The projection kernel persists every inbound UMH command and its policy
// decision locally. UMH is a control plane, never a direct writer to this DB.
export const umhCommands = pgTable("umh_commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  commandId: uuid("command_id").notNull().unique(),
  commandType: text("command_type").notNull(),
  schemaVersion: text("schema_version").notNull().default("umh.command.v1"),
  status: text("status").notNull().default("received"),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "set null",
  }),
  delegatedUserId: integer("delegated_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  payload: json("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  correlationId: text("correlation_id"),
  traceId: text("trace_id").notNull(),
  issuedAt: timestamp("issued_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const umhCommandOutcomes = pgTable("umh_command_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  commandId: uuid("command_id")
    .references(() => umhCommands.id, { onDelete: "cascade" })
    .notNull(),
  status: text("status").notNull(),
  detail: text("detail").notNull().default(""),
  payload: json("payload")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  correlationId: text("correlation_id"),
  traceId: text("trace_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const umhApprovals = pgTable("umh_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  commandId: uuid("command_id")
    .references(() => umhCommands.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("pending"),
  reason: text("reason").notNull(),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const umhAuditRecords = pgTable("umh_audit_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  commandId: uuid("command_id").references(() => umhCommands.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  result: text("result").notNull(),
  businessId: uuid("business_id").references(() => businesses.id, {
    onDelete: "set null",
  }),
  actorUserId: integer("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  correlationId: text("correlation_id"),
  traceId: text("trace_id").notNull(),
  metadata: json("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const umhNonces = pgTable("umh_nonces", {
  id: uuid("id").primaryKey().defaultRandom(),
  nonce: text("nonce").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Channel Message schema
export const channelMessages = pgTable("channel_messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .references(() => channels.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  parentMessageId: integer("parent_message_id").references(
    (): AnyPgColumn => channelMessages.id,
    { onDelete: "cascade" },
  ),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  likes: integer("likes").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channelMessageLikes = pgTable(
  "channel_message_likes",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .references(() => channelMessages.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    messageUserUnique: unique("channel_message_like_unique").on(
      table.messageId,
      table.userId,
    ),
  }),
);

export const channelPolls = pgTable("channel_polls", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id")
    .references(() => channels.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  question: text("question").notNull(),
  closesAt: timestamp("closes_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const channelPollOptions = pgTable("channel_poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id")
    .references(() => channelPolls.id, { onDelete: "cascade" })
    .notNull(),
  label: text("label").notNull(),
  position: integer("position").notNull(),
});

export const channelPollVotes = pgTable(
  "channel_poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .references(() => channelPolls.id, { onDelete: "cascade" })
      .notNull(),
    optionId: integer("option_id")
      .references(() => channelPollOptions.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    oneVotePerMember: unique("channel_poll_vote_user_unique").on(
      table.pollId,
      table.userId,
    ),
  }),
);

export const insertChannelMessageSchema = createInsertSchema(
  channelMessages,
).pick({
  channelId: true,
  userId: true,
  parentMessageId: true,
  content: true,
  isPinned: true,
});

// Followers schema
export const followers = pgTable(
  "followers",
  {
    id: serial("id").primaryKey(),
    followerId: integer("follower_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    followedId: integer("followed_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      // Create a unique constraint so a user can only follow another user once
      followerFollowedUnique: unique("follower_followed_unique").on(
        table.followerId,
        table.followedId,
      ),
    };
  },
);

export const insertFollowerSchema = createInsertSchema(followers).pick({
  followerId: true,
  followedId: true,
});

// Revenue data schema for dashboard
export const revenue = pgTable("revenue", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  amount: doublePrecision("amount").notNull(),
  date: timestamp("date").notNull(),
  source: text("source").notNull(),
});

export const insertRevenueSchema = createInsertSchema(revenue).pick({
  userId: true,
  amount: true,
  date: true,
  source: true,
});

// Contact schema for CRM
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  contactName: text("contact_name").notNull(),
  contactImage: text("contact_image"),
  purchaseInfo: text("purchase_info"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  userId: true,
  contactName: true,
  contactImage: true,
  purchaseInfo: true,
});

// Document schema for Notion-style editor
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  userId: true,
  title: true,
  content: true,
});

// Story schema
export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type").default("image").notNull(), // image or video
  caption: text("caption"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Stories expire after 24 hours
  viewCount: integer("view_count").default(0).notNull(),
});

export const insertStorySchema = createInsertSchema(stories).pick({
  userId: true,
  mediaUrl: true,
  mediaType: true,
  caption: true,
});

export const storyViews = pgTable(
  "story_views",
  {
    id: serial("id").primaryKey(),
    storyId: integer("story_id")
      .references(() => stories.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  },
  (table) => ({
    storyViewerUnique: unique("story_view_story_user_unique").on(
      table.storyId,
      table.userId,
    ),
  }),
);

export const storyReactions = pgTable(
  "story_reactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    storyId: integer("story_id")
      .references(() => stories.id, { onDelete: "cascade" })
      .notNull(),
    reaction: text("reaction").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userStoryUnique: unique("story_reaction_user_story_unique").on(
      table.userId,
      table.storyId,
    ),
  }),
);

// Notification schema
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").notNull(),
    message: text("message").notNull(),
    read: boolean("read").default(false).notNull(),
    linkTo: text("link_to"),
    relatedUserId: integer("related_user_id").references(() => users.id),
    relatedUserImage: text("related_user_image"),
    // Trusted workflows attach their source so retries cannot create duplicate
    // notifications. These fields are intentionally excluded from the public
    // insert schema below.
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceUnique: unique("notifications_source_unique").on(
      table.userId,
      table.type,
      table.sourceType,
      table.sourceId,
    ),
  }),
);

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  userId: true,
  type: true,
  message: true,
  read: true,
  linkTo: true,
  relatedUserId: true,
  relatedUserImage: true,
});

// Direct Message Conversation schema
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isGroup: boolean("is_group").default(false).notNull(),
  name: text("name"),
  icon: text("icon"),
});

export const insertConversationSchema = createInsertSchema(conversations);

// Conversation Participants (for both direct messages and group chats)
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      // Create a unique constraint so a user can only be in a conversation once
      userConversation: unique("user_conversation").on(
        table.userId,
        table.conversationId,
      ),
    };
  },
);

export const insertConversationParticipantSchema = createInsertSchema(
  conversationParticipants,
).pick({
  conversationId: true,
  userId: true,
  isAdmin: true,
});

// Direct Messages schema
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull(),
  senderId: integer("sender_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  read: boolean("read").default(false).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  isEdited: boolean("is_edited").default(false),
  replyToMessageId: integer("reply_to_message_id"),
  reactions: json("reactions").default({}).notNull(), // Stores user reactions: { userId: reactionType }
});

export const insertDirectMessageSchema = createInsertSchema(
  directMessages,
).pick({
  conversationId: true,
  senderId: true,
  content: true,
  read: true,
  isEdited: true,
  replyToMessageId: true,
  reactions: true,
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedBusinesses: many(businesses, { relationName: "business_owner" }),
  businessMemberships: many(businessMembers),
  assets: many(assets),
  contentDrafts: many(contentDrafts),
  posts: many(posts),
  postViews: many(postViews),
  comments: many(comments),
  products: many(products),
  shoppingCartItems: many(shoppingCartItems),
  purchases: many(purchases),
  orders: many(orders),
  entitlements: many(entitlements),
  creatorPaymentAccounts: many(creatorPaymentAccounts),
  creatorEarnings: many(creatorEarningsAllocations),
  stripeConnectOauthStates: many(stripeConnectOauthStates),
  communityMemberships: many(communityMemberships),
  aiAgents: many(aiAgents),
  aiChats: many(aiChats),
  channelMessages: many(channelMessages),
  revenues: many(revenue),
  contacts: many(contacts),
  documents: many(documents),
  stories: many(stories),
  notifications: many(notifications),
  relatedToNotifications: many(notifications, { relationName: "related_user" }),
  conversationParticipants: many(conversationParticipants),
  sentMessages: many(directMessages, { relationName: "sender" }),
  savedPosts: many(savedPosts),
  followers: many(followers, { relationName: "followed" }),
  following: many(followers, { relationName: "follower" }),
  taggedIn: many(taggedUsers),
}));

// Tagged Users schema
export const taggedUsers = pgTable(
  "tagged_users",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    positionX: doublePrecision("position_x").notNull(),
    positionY: doublePrecision("position_y").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      // User can only be tagged once in a specific position on a post
      uniquePostUserPosition: unique("unique_post_user_position").on(
        table.postId,
        table.userId,
        table.positionX,
        table.positionY,
      ),
    };
  },
);

export const insertTaggedUserSchema = createInsertSchema(taggedUsers).pick({
  postId: true,
  userId: true,
  positionX: true,
  positionY: true,
});

export const taggedUsersRelations = relations(taggedUsers, ({ one }) => ({
  post: one(posts, { fields: [taggedUsers.postId], references: [posts.id] }),
  user: one(users, { fields: [taggedUsers.userId], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(users, { fields: [posts.userId], references: [users.id] }),
  repostOf: one(posts, {
    fields: [posts.repostOfId],
    references: [posts.id],
    relationName: "post_repost_origin",
  }),
  reposts: many(posts, { relationName: "post_repost_origin" }),
  views: many(postViews),
  comments: many(comments),
  savedByUsers: many(savedPosts),
  taggedUsers: many(taggedUsers),
}));

export const savedPostsRelations = relations(savedPosts, ({ one }) => ({
  user: one(users, { fields: [savedPosts.userId], references: [users.id] }),
  post: one(posts, { fields: [savedPosts.postId], references: [posts.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "parent_comment",
  }),
  replies: many(comments, { relationName: "parent_comment" }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  user: one(users, { fields: [products.userId], references: [users.id] }),
  business: one(businesses, {
    fields: [products.businessId],
    references: [businesses.id],
  }),
  community: one(communities, {
    fields: [products.communityId],
    references: [communities.id],
  }),
  purchases: many(purchases),
  orderItems: many(orderItems),
  entitlements: many(entitlements),
  reviews: many(productReviews),
  shoppingCartItems: many(shoppingCartItems),
}));

export const shoppingCartItemsRelations = relations(
  shoppingCartItems,
  ({ one }) => ({
    user: one(users, {
      fields: [shoppingCartItems.userId],
      references: [users.id],
    }),
    product: one(products, {
      fields: [shoppingCartItems.productId],
      references: [products.id],
    }),
  }),
);

export const productReviewsRelations = relations(productReviews, ({ one }) => ({
  product: one(products, {
    fields: [productReviews.productId],
    references: [products.id],
  }),
  user: one(users, { fields: [productReviews.userId], references: [users.id] }),
}));

export const postViewsRelations = relations(postViews, ({ one }) => ({
  post: one(posts, { fields: [postViews.postId], references: [posts.id] }),
  user: one(users, { fields: [postViews.userId], references: [users.id] }),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  owner: one(users, {
    fields: [businesses.ownerUserId],
    references: [users.id],
    relationName: "business_owner",
  }),
  members: many(businessMembers),
  orders: many(orders),
  assets: many(assets),
  contentDrafts: many(contentDrafts),
  campaigns: many(campaigns),
}));

export const businessMembersRelations = relations(
  businessMembers,
  ({ one }) => ({
    business: one(businesses, {
      fields: [businessMembers.businessId],
      references: [businesses.id],
    }),
    user: one(users, {
      fields: [businessMembers.userId],
      references: [users.id],
    }),
  }),
);

export const assetsRelations = relations(assets, ({ one }) => ({
  owner: one(users, { fields: [assets.ownerUserId], references: [users.id] }),
  business: one(businesses, {
    fields: [assets.businessId],
    references: [businesses.id],
  }),
}));

export const contentDraftsRelations = relations(contentDrafts, ({ one }) => ({
  user: one(users, { fields: [contentDrafts.userId], references: [users.id] }),
  business: one(businesses, {
    fields: [contentDrafts.businessId],
    references: [businesses.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  business: one(businesses, {
    fields: [campaigns.businessId],
    references: [businesses.id],
  }),
  owner: one(users, {
    fields: [campaigns.ownerUserId],
    references: [users.id],
  }),
  deliverables: many(campaignDeliverables),
  metrics: many(campaignMetrics),
}));

export const campaignDeliverablesRelations = relations(
  campaignDeliverables,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignDeliverables.campaignId],
      references: [campaigns.id],
    }),
    contentDraft: one(contentDrafts, {
      fields: [campaignDeliverables.contentDraftId],
      references: [contentDrafts.id],
    }),
    distributionJob: one(distributionJobs, {
      fields: [campaignDeliverables.distributionJobId],
      references: [distributionJobs.id],
    }),
  }),
);

export const campaignMetricsRelations = relations(
  campaignMetrics,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignMetrics.campaignId],
      references: [campaigns.id],
    }),
  }),
);

export const purchasesRelations = relations(purchases, ({ one }) => ({
  buyer: one(users, { fields: [purchases.buyerId], references: [users.id] }),
  product: one(products, {
    fields: [purchases.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  buyer: one(users, { fields: [orders.buyerId], references: [users.id] }),
  business: one(businesses, {
    fields: [orders.businessId],
    references: [businesses.id],
  }),
  items: many(orderItems),
  entitlements: many(entitlements),
  creatorEarningsAllocation: many(creatorEarningsAllocations),
}));

export const creatorPaymentAccountsRelations = relations(
  creatorPaymentAccounts,
  ({ one }) => ({
    user: one(users, {
      fields: [creatorPaymentAccounts.userId],
      references: [users.id],
    }),
  }),
);

export const creatorEarningsAllocationsRelations = relations(
  creatorEarningsAllocations,
  ({ one }) => ({
    order: one(orders, {
      fields: [creatorEarningsAllocations.orderId],
      references: [orders.id],
    }),
    seller: one(users, {
      fields: [creatorEarningsAllocations.sellerUserId],
      references: [users.id],
    }),
  }),
);

export const stripeConnectOauthStatesRelations = relations(
  stripeConnectOauthStates,
  ({ one }) => ({
    user: one(users, {
      fields: [stripeConnectOauthStates.userId],
      references: [users.id],
    }),
  }),
);

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  user: one(users, { fields: [entitlements.userId], references: [users.id] }),
  product: one(products, {
    fields: [entitlements.productId],
    references: [products.id],
  }),
  sourceOrder: one(orders, {
    fields: [entitlements.sourceOrderId],
    references: [orders.id],
  }),
}));

export const aiAgentsRelations = relations(aiAgents, ({ one, many }) => ({
  user: one(users, { fields: [aiAgents.userId], references: [users.id] }),
  aiChats: many(aiChats),
}));

export const aiChatsRelations = relations(aiChats, ({ one }) => ({
  user: one(users, { fields: [aiChats.userId], references: [users.id] }),
  agent: one(aiAgents, {
    fields: [aiChats.agentId],
    references: [aiAgents.id],
  }),
}));

export const communitiesRelations = relations(communities, ({ many }) => ({
  channels: many(channels),
  memberships: many(communityMemberships),
  products: many(products),
  rooms: many(communityRooms),
  moderationActions: many(communityModerationActions),
}));

export const communityMembershipsRelations = relations(
  communityMemberships,
  ({ one }) => ({
    user: one(users, {
      fields: [communityMemberships.userId],
      references: [users.id],
    }),
    community: one(communities, {
      fields: [communityMemberships.communityId],
      references: [communities.id],
    }),
  }),
);

export const communityModerationActionsRelations = relations(
  communityModerationActions,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityModerationActions.communityId],
      references: [communities.id],
    }),
    targetUser: one(users, {
      fields: [communityModerationActions.targetUserId],
      references: [users.id],
    }),
    actorUser: one(users, {
      fields: [communityModerationActions.actorUserId],
      references: [users.id],
    }),
  }),
);

export const channelsRelations = relations(channels, ({ one, many }) => ({
  community: one(communities, {
    fields: [channels.communityId],
    references: [communities.id],
  }),
  messages: many(channelMessages),
  polls: many(channelPolls),
  rooms: many(communityRooms),
}));

export const communityRoomsRelations = relations(
  communityRooms,
  ({ one, many }) => ({
    community: one(communities, {
      fields: [communityRooms.communityId],
      references: [communities.id],
    }),
    channel: one(channels, {
      fields: [communityRooms.channelId],
      references: [channels.id],
    }),
    host: one(users, {
      fields: [communityRooms.hostUserId],
      references: [users.id],
    }),
    notes: many(communityRoomNotes),
    actionItems: many(communityRoomActionItems),
    attendees: many(communityRoomAttendees),
    intelligencePolicies: many(communityRoomIntelligencePolicies),
    consents: many(communityRoomConsents),
    aiProfiles: many(communityRoomAiProfiles),
    insights: many(communityRoomInsights),
    recordings: many(communityRoomRecordings),
    transcriptSegments: many(communityRoomTranscriptSegments),
    agentSessions: many(communityRoomAgentSessions),
  }),
);

export const communityRoomNotesRelations = relations(
  communityRoomNotes,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomNotes.roomId],
      references: [communityRooms.id],
    }),
    author: one(users, {
      fields: [communityRoomNotes.authorUserId],
      references: [users.id],
    }),
  }),
);

export const communityRoomActionItemsRelations = relations(
  communityRoomActionItems,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomActionItems.roomId],
      references: [communityRooms.id],
    }),
    createdBy: one(users, {
      fields: [communityRoomActionItems.createdByUserId],
      references: [users.id],
    }),
    assignee: one(users, {
      fields: [communityRoomActionItems.assigneeUserId],
      references: [users.id],
    }),
  }),
);

export const communityRoomAttendeesRelations = relations(
  communityRoomAttendees,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomAttendees.roomId],
      references: [communityRooms.id],
    }),
    user: one(users, {
      fields: [communityRoomAttendees.userId],
      references: [users.id],
    }),
  }),
);

export const communityRoomIntelligencePoliciesRelations = relations(
  communityRoomIntelligencePolicies,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomIntelligencePolicies.roomId],
      references: [communityRooms.id],
    }),
    updatedBy: one(users, {
      fields: [communityRoomIntelligencePolicies.updatedByUserId],
      references: [users.id],
    }),
  }),
);

export const communityRoomConsentsRelations = relations(
  communityRoomConsents,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomConsents.roomId],
      references: [communityRooms.id],
    }),
    user: one(users, {
      fields: [communityRoomConsents.userId],
      references: [users.id],
    }),
  }),
);

export const communityRoomAiProfilesRelations = relations(
  communityRoomAiProfiles,
  ({ one, many }) => ({
    room: one(communityRooms, {
      fields: [communityRoomAiProfiles.roomId],
      references: [communityRooms.id],
    }),
    createdBy: one(users, {
      fields: [communityRoomAiProfiles.createdByUserId],
      references: [users.id],
    }),
    insights: many(communityRoomInsights),
  }),
);

export const communityRoomInsightsRelations = relations(
  communityRoomInsights,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomInsights.roomId],
      references: [communityRooms.id],
    }),
    agentProfile: one(communityRoomAiProfiles, {
      fields: [communityRoomInsights.agentProfileId],
      references: [communityRoomAiProfiles.id],
    }),
    targetUser: one(users, {
      fields: [communityRoomInsights.targetUserId],
      references: [users.id],
    }),
  }),
);

export const communityRoomRecordingsRelations = relations(
  communityRoomRecordings,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomRecordings.roomId],
      references: [communityRooms.id],
    }),
    requestedBy: one(users, {
      fields: [communityRoomRecordings.requestedByUserId],
      references: [users.id],
    }),
  }),
);

export const communityRoomTranscriptSegmentsRelations = relations(
  communityRoomTranscriptSegments,
  ({ one }) => ({
    room: one(communityRooms, {
      fields: [communityRoomTranscriptSegments.roomId],
      references: [communityRooms.id],
    }),
    agentSession: one(communityRoomAgentSessions, {
      fields: [communityRoomTranscriptSegments.agentSessionId],
      references: [communityRoomAgentSessions.id],
    }),
    speaker: one(users, {
      fields: [communityRoomTranscriptSegments.speakerUserId],
      references: [users.id],
    }),
  }),
);

export const communityRoomAgentSessionsRelations = relations(
  communityRoomAgentSessions,
  ({ one, many }) => ({
    room: one(communityRooms, {
      fields: [communityRoomAgentSessions.roomId],
      references: [communityRooms.id],
    }),
    agentProfile: one(communityRoomAiProfiles, {
      fields: [communityRoomAgentSessions.agentProfileId],
      references: [communityRoomAiProfiles.id],
    }),
    startedBy: one(users, {
      fields: [communityRoomAgentSessions.startedByUserId],
      references: [users.id],
    }),
    transcriptSegments: many(communityRoomTranscriptSegments),
  }),
);

export const channelMessagesRelations = relations(
  channelMessages,
  ({ one, many }) => ({
    channel: one(channels, {
      fields: [channelMessages.channelId],
      references: [channels.id],
    }),
    user: one(users, {
      fields: [channelMessages.userId],
      references: [users.id],
    }),
    parentMessage: one(channelMessages, {
      fields: [channelMessages.parentMessageId],
      references: [channelMessages.id],
      relationName: "channel_message_replies",
    }),
    replies: many(channelMessages, { relationName: "channel_message_replies" }),
  }),
);

export const channelMessageLikesRelations = relations(
  channelMessageLikes,
  ({ one }) => ({
    message: one(channelMessages, {
      fields: [channelMessageLikes.messageId],
      references: [channelMessages.id],
    }),
    user: one(users, {
      fields: [channelMessageLikes.userId],
      references: [users.id],
    }),
  }),
);

export const channelPollsRelations = relations(
  channelPolls,
  ({ one, many }) => ({
    channel: one(channels, {
      fields: [channelPolls.channelId],
      references: [channels.id],
    }),
    creator: one(users, {
      fields: [channelPolls.userId],
      references: [users.id],
    }),
    options: many(channelPollOptions),
    votes: many(channelPollVotes),
  }),
);

export const channelPollOptionsRelations = relations(
  channelPollOptions,
  ({ one, many }) => ({
    poll: one(channelPolls, {
      fields: [channelPollOptions.pollId],
      references: [channelPolls.id],
    }),
    votes: many(channelPollVotes),
  }),
);

export const channelPollVotesRelations = relations(
  channelPollVotes,
  ({ one }) => ({
    poll: one(channelPolls, {
      fields: [channelPollVotes.pollId],
      references: [channelPolls.id],
    }),
    option: one(channelPollOptions, {
      fields: [channelPollVotes.optionId],
      references: [channelPollOptions.id],
    }),
    user: one(users, {
      fields: [channelPollVotes.userId],
      references: [users.id],
    }),
  }),
);

export const revenueRelations = relations(revenue, ({ one }) => ({
  user: one(users, { fields: [revenue.userId], references: [users.id] }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, { fields: [contacts.userId], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  relatedUser: one(users, {
    fields: [notifications.relatedUserId],
    references: [users.id],
    relationName: "related_user",
  }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(directMessages),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const directMessagesRelations = relations(directMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [directMessages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [directMessages.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  replyTo: one(directMessages, {
    fields: [directMessages.replyToMessageId],
    references: [directMessages.id],
    relationName: "message_reply",
  }),
}));

export const followersRelations = relations(followers, ({ one }) => ({
  follower: one(users, {
    fields: [followers.followerId],
    references: [users.id],
    relationName: "follower",
  }),
  followed: one(users, {
    fields: [followers.followedId],
    references: [users.id],
    relationName: "followed",
  }),
}));

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type AccountPrivacyRequest = typeof accountPrivacyRequests.$inferSelect;
export type ProductionBackup = typeof productionBackups.$inferSelect;

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type BusinessMember = typeof businessMembers.$inferSelect;
export type InsertBusinessMember = z.infer<typeof insertBusinessMemberSchema>;
export type Asset = typeof assets.$inferSelect;
export type ContentDraft = typeof contentDrafts.$inferSelect;
export type CutStudioProject = typeof cutStudioProjects.$inferSelect;
export type CutStudioJob = typeof cutStudioJobs.$inferSelect;
export type BroadcastStudio = typeof broadcastStudios.$inferSelect;
export type BroadcastDestination = typeof broadcastDestinations.$inferSelect;
export type BroadcastSession = typeof broadcastSessions.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type CampaignDeliverable = typeof campaignDeliverables.$inferSelect;
export type CampaignMetric = typeof campaignMetrics.$inferSelect;

export type Post = typeof posts.$inferSelect;
export type PostView = typeof postViews.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type Product = typeof products.$inferSelect;
export type ProductSave = typeof productSaves.$inferSelect;
export type ShoppingCartItem = typeof shoppingCartItems.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Order = typeof orders.$inferSelect;
export type CreatorPaymentAccount = typeof creatorPaymentAccounts.$inferSelect;
export type CreatorEarningsAllocation =
  typeof creatorEarningsAllocations.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;

export type AIAgent = typeof aiAgents.$inferSelect;
export type InsertAIAgent = z.infer<typeof insertAiAgentSchema>;

export type AIChat = typeof aiChats.$inferSelect;
export type InsertAIChat = z.infer<typeof insertAiChatSchema>;

export type AutomationDefinition = typeof automationDefinitions.$inferSelect;
export type AutomationStep = typeof automationSteps.$inferSelect;
export type AutomationTriggerEvent = typeof automationTriggerEvents.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type AutomationStepRun = typeof automationStepRuns.$inferSelect;
export type AutomationApproval = typeof automationApprovals.$inferSelect;
export type AutomationActionReceipt = typeof automationActionReceipts.$inferSelect;
export type AutomationThread = typeof automationThreads.$inferSelect;
export type AutomationMessage = typeof automationMessages.$inferSelect;
export type AutomationAuditEvent = typeof automationAuditEvents.$inferSelect;

export type RelationshipChannelConnection =
  typeof relationshipChannelConnections.$inferSelect;
export type Relationship = typeof relationships.$inferSelect;
export type RelationshipExternalIdentity =
  typeof relationshipExternalIdentities.$inferSelect;
export type RelationshipConsent = typeof relationshipConsents.$inferSelect;
export type RelationshipConversation =
  typeof relationshipConversations.$inferSelect;
export type RelationshipConversationBinding =
  typeof relationshipConversationBindings.$inferSelect;
export type RelationshipMessage = typeof relationshipMessages.$inferSelect;
export type RelationshipProviderEvent =
  typeof relationshipProviderEvents.$inferSelect;
export type RelationshipDeliveryJob =
  typeof relationshipDeliveryJobs.$inferSelect;
export type RelationshipNativeDeliveryReceipt =
  typeof relationshipNativeDeliveryReceipts.$inferSelect;
export type RelationshipAgentAuthorityPolicy =
  typeof relationshipAgentAuthorityPolicies.$inferSelect;
export type RelationshipMemoryFact = typeof relationshipMemoryFacts.$inferSelect;
export type RelationshipVoiceProfile =
  typeof relationshipVoiceProfiles.$inferSelect;
export type RelationshipVoiceGenerationJob =
  typeof relationshipVoiceGenerationJobs.$inferSelect;
export type RelationshipAuditEvent = typeof relationshipAuditEvents.$inferSelect;
export type RelationshipTenantPolicy = typeof relationshipTenantPolicies.$inferSelect;
export type RelationshipUsageLedgerEntry = typeof relationshipUsageLedger.$inferSelect;
export type RelationshipUsageReservation = typeof relationshipUsageReservations.$inferSelect;
export type RelationshipOperationalAlert = typeof relationshipOperationalAlerts.$inferSelect;
export type RelationshipRoomBinding = typeof relationshipRoomBindings.$inferSelect;

export type Community = typeof communities.$inferSelect;
export type InsertCommunity = z.infer<typeof insertCommunitySchema>;
export type CommunityMembership = typeof communityMemberships.$inferSelect;
export type InsertCommunityMembership = z.infer<
  typeof insertCommunityMembershipSchema
>;
export type CommunityModerationAction =
  typeof communityModerationActions.$inferSelect;

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;

export type CommunityRoom = typeof communityRooms.$inferSelect;
export type CommunityRoomNote = typeof communityRoomNotes.$inferSelect;
export type CommunityRoomActionItem =
  typeof communityRoomActionItems.$inferSelect;
export type CommunityRoomAttendee = typeof communityRoomAttendees.$inferSelect;
export type CommunityRoomIntelligencePolicy =
  typeof communityRoomIntelligencePolicies.$inferSelect;
export type CommunityRoomConsent = typeof communityRoomConsents.$inferSelect;
export type CommunityRoomAiProfile =
  typeof communityRoomAiProfiles.$inferSelect;
export type CommunityRoomInsight = typeof communityRoomInsights.$inferSelect;
export type CommunityRoomRecording =
  typeof communityRoomRecordings.$inferSelect;
export type CommunityRoomTranscriptSegment =
  typeof communityRoomTranscriptSegments.$inferSelect;
export type CommunityRoomAgentSession =
  typeof communityRoomAgentSessions.$inferSelect;

export type ChannelMessage = typeof channelMessages.$inferSelect;
export type InsertChannelMessage = z.infer<typeof insertChannelMessageSchema>;
export type ChannelMessageLike = typeof channelMessageLikes.$inferSelect;
export type ChannelPoll = typeof channelPolls.$inferSelect;
export type ChannelPollOption = typeof channelPollOptions.$inferSelect;
export type ChannelPollVote = typeof channelPollVotes.$inferSelect;

export type Revenue = typeof revenue.$inferSelect;
export type InsertRevenue = z.infer<typeof insertRevenueSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type ConversationParticipant =
  typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<
  typeof insertConversationParticipantSchema
>;

export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;

export type Story = typeof stories.$inferSelect;
export type InsertStory = z.infer<typeof insertStorySchema>;

export type SavedPost = typeof savedPosts.$inferSelect;
export type InsertSavedPost = z.infer<typeof insertSavedPostSchema>;

export type PostLike = typeof postLikes.$inferSelect;
export type StoryReaction = typeof storyReactions.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type PlaylistPost = typeof playlistPosts.$inferSelect;
export type Event = typeof events.$inferSelect;
export type CourseProgress = typeof courseProgress.$inferSelect;
export type CourseAssessment = typeof courseAssessments.$inferSelect;
export type CourseAssessmentAttempt =
  typeof courseAssessmentAttempts.$inferSelect;
export type DistributionJob = typeof distributionJobs.$inferSelect;
export type SocialConnection = typeof socialConnections.$inferSelect;
export type DistributionDeliveryAttempt =
  typeof distributionDeliveryAttempts.$inferSelect;

export type Follower = typeof followers.$inferSelect;
export type InsertFollower = z.infer<typeof insertFollowerSchema>;

export type TaggedUser = typeof taggedUsers.$inferSelect;
export type InsertTaggedUser = z.infer<typeof insertTaggedUserSchema>;
