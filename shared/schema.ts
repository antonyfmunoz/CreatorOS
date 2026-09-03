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
  check,
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
  pushNotificationsEnabled: boolean("push_notifications_enabled")
    .notNull()
    .default(true),
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
    dateKeyUnique: uniqueIndex("production_backups_date_key_unique").on(
      table.dateKey,
    ),
    statusStartedIdx: index("production_backups_status_started_idx").on(
      table.status,
      table.startedAt,
    ),
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
  // Durable Media Cloud identity. Legacy URL columns remain as a compatibility
  // cache for older posts and lightweight clients.
  mediaAssetId: uuid("media_asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  location: text("location"),
  mediaType: text("media_type").default("text"), // text, photo, audio, video
  repostOfId: integer("repost_of_id"),
  // Browser/PWA retries use a creator-scoped mutation identity so reconnects
  // cannot publish the same post twice.
  clientMutationId: text("client_mutation_id"),
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
  mediaAssetId: true,
  location: true,
  mediaType: true,
  repostOfId: true,
  clientMutationId: true,
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
  (table) => ({
    postUnique: unique("post_polls_post_unique").on(table.postId),
  }),
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
  (table) => ({
    pollPositionUnique: unique("post_poll_option_position_unique").on(
      table.pollId,
      table.position,
    ),
  }),
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
  (table) => ({
    oneVotePerUser: unique("post_poll_vote_user_unique").on(
      table.pollId,
      table.userId,
    ),
  }),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
    verificationStatus: text("verification_status")
      .notNull()
      .default("observed"),
    verifiedAt: timestamp("verified_at"),
    lastSeenAt: timestamp("last_seen_at"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessProviderSubjectUnique: unique(
      "relationship_external_identities_business_provider_subject_unique",
    ).on(table.businessId, table.provider, table.providerSubjectId),
    relationshipIdx: index(
      "relationship_external_identities_relationship_idx",
    ).on(table.businessId, table.relationshipId),
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
    evidence: json("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("suggested"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
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
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipPurposeIdx: index(
      "relationship_consents_relationship_purpose_idx",
    ).on(table.businessId, table.relationshipId, table.channel, table.purpose),
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
    assignedByUserId: integer("assigned_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
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
    relationshipCreatedIdx: index(
      "relationship_notes_relationship_created_idx",
    ).on(table.businessId, table.relationshipId, table.createdAt),
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
    assignedToUserId: integer("assigned_to_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
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
    businessAssigneeStatusIdx: index(
      "relationship_tasks_assignee_status_idx",
    ).on(table.businessId, table.assignedToUserId, table.status, table.dueAt),
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
    assignedToUserId: integer("assigned_to_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    aiMode: text("ai_mode").notNull().default("observe"),
    lastMessageAt: timestamp("last_message_at"),
    snoozedUntil: timestamp("snoozed_until"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    nativeConversationUnique: unique(
      "relationship_conversations_native_unique",
    ).on(table.businessId, table.nativeConversationId),
    businessQueueUpdatedIdx: index(
      "relationship_conversations_queue_updated_idx",
    ).on(table.businessId, table.queue, table.status, table.updatedAt),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    externalThreadUnique: unique(
      "relationship_conversation_bindings_thread_unique",
    ).on(
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
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    role: text("role").notNull().default("customer"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
  },
  (table) => ({
    conversationParticipantIdx: index(
      "relationship_conversation_participants_idx",
    ).on(table.businessId, table.conversationId),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    bindingExternalMessageUnique: unique(
      "relationship_messages_binding_external_unique",
    ).on(table.bindingId, table.externalMessageId),
    conversationOccurredIdx: index(
      "relationship_messages_conversation_occurred_idx",
    ).on(table.businessId, table.conversationId, table.occurredAt),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
    conversationCreatedIdx: index(
      "relationship_conversation_notes_created_idx",
    ).on(table.businessId, table.conversationId, table.createdAt),
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
      .references(() => relationshipChannelConnections.id, {
        onDelete: "cascade",
      })
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
    connectionEventUnique: unique(
      "relationship_provider_events_external_unique",
    ).on(table.connectionId, table.externalEventId),
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
      .references(() => relationshipChannelConnections.id, {
        onDelete: "restrict",
      })
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
    idempotencyUnique: unique(
      "relationship_delivery_jobs_idempotency_unique",
    ).on(table.businessId, table.idempotencyKey),
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
    businessKeyUnique: unique(
      "relationship_native_delivery_business_key_unique",
    ).on(table.businessId, table.idempotencyKey),
  }),
);

// Durable mutation receipts keep native edits, deletes, reactions and read
// cursors idempotent across worker crashes. The target is nullable because a
// successful delete intentionally removes the legacy direct-message row while
// the receipt and canonical audit evidence must remain.
export const relationshipNativeActionReceipts = pgTable(
  "relationship_native_action_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actionType: text("action_type").notNull(),
    requestHash: text("request_hash").notNull(),
    targetDirectMessageId: integer("target_direct_message_id").references(
      () => directMessages.id,
      { onDelete: "set null" },
    ),
    result: json("result")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessKeyUnique: unique(
      "relationship_native_action_receipts_business_key_unique",
    ).on(table.businessId, table.idempotencyKey),
    targetIdx: index("relationship_native_action_receipts_target_idx").on(
      table.businessId,
      table.targetDirectMessageId,
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
      .references(() => relationshipChannelConnections.id, {
        onDelete: "cascade",
      })
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
    connectionStreamUnique: unique(
      "relationship_sync_cursors_stream_unique",
    ).on(table.connectionId, table.stream),
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
    allowedActions: json("allowed_actions")
      .$type<string[]>()
      .notNull()
      .default([]),
    approvalRequiredActions: json("approval_required_actions")
      .$type<string[]>()
      .notNull()
      .default([]),
    blockedActions: json("blocked_actions")
      .$type<string[]>()
      .notNull()
      .default([]),
    channelAllowlist: json("channel_allowlist")
      .$type<string[]>()
      .notNull()
      .default([]),
    maxCostUnitsPerRun: integer("max_cost_units_per_run")
      .notNull()
      .default(100),
    instructions: text("instructions").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessAgentUnique: unique(
      "relationship_agent_authority_business_agent_unique",
    ).on(table.businessId, table.agentKey),
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
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
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
    evidence: json("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    confidence: doublePrecision("confidence"),
    status: text("status").notNull().default("proposed"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    reviewedAt: timestamp("reviewed_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationStatusIdx: index(
      "relationship_agent_suggestions_status_idx",
    ).on(table.businessId, table.conversationId, table.status, table.createdAt),
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
      .default(
        "AI-generated voice message sent with the voice owner's authorization.",
      ),
    allowedUseCases: json("allowed_use_cases")
      .$type<string[]>()
      .notNull()
      .default([]),
    blockedUseCases: json("blocked_use_cases")
      .$type<string[]>()
      .notNull()
      .default([]),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    businessOwnerNameUnique: unique(
      "relationship_voice_profiles_owner_name_unique",
    ).on(table.businessId, table.ownerUserId, table.displayName),
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
    profileVersionUnique: unique(
      "relationship_voice_consents_profile_version_unique",
    ).on(table.voiceProfileId, table.consentVersion),
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
    approvedByUserId: integer("approved_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
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
    provenance: json("provenance")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessCreatedIdx: index(
      "relationship_audit_events_business_created_idx",
    ).on(table.businessId, table.createdAt),
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
    monthlyOutboundMessages: integer("monthly_outbound_messages")
      .notNull()
      .default(10_000),
    monthlyAiRuns: integer("monthly_ai_runs").notNull().default(1_000),
    monthlyVoiceSeconds: integer("monthly_voice_seconds")
      .notNull()
      .default(3_600),
    monthlyRealtimeMinutes: integer("monthly_realtime_minutes")
      .notNull()
      .default(600),
    maxActiveConnections: integer("max_active_connections")
      .notNull()
      .default(10),
    providerPayloadRetentionDays: integer("provider_payload_retention_days")
      .notNull()
      .default(30),
    auditRetentionDays: integer("audit_retention_days").notNull().default(365),
    realtimeArtifactRetentionDays: integer("realtime_artifact_retention_days")
      .notNull()
      .default(30),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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
    businessKeyUnique: unique(
      "relationship_usage_reservation_business_key_unique",
    ).on(table.businessId, table.idempotencyKey),
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
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessFingerprintUnique: unique(
      "relationship_alert_business_fingerprint_unique",
    ).on(table.businessId, table.fingerprint),
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
  // Restricted-account comments are held for the post owner instead of being
  // exposed to the audience. The author can still see their own held comment,
  // which prevents restriction from becoming an abuse signal.
  visibility: text("visibility").notNull().default("public"),
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
  discountAmount: doublePrecision("discount_amount").notNull().default(0),
  promotionCode: text("promotion_code"),
  trialDays: integer("trial_days").notNull().default(0),
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
  subscriptionCancelAtPeriodEnd: boolean("subscription_cancel_at_period_end")
    .notNull()
    .default(false),
  financialStatus: text("financial_status").notNull().default("open"),
  refundedAmount: doublePrecision("refunded_amount").notNull().default(0),
  disputedAmount: doublePrecision("disputed_amount").notNull().default(0),
  lastProviderEventAt: timestamp("last_provider_event_at"),
  attributionContext: json("attribution_context")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
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
  requirementsCurrentlyDue: json("requirements_currently_due")
    .$type<string[]>()
    .notNull()
    .default([]),
  requirementsPastDue: json("requirements_past_due")
    .$type<string[]>()
    .notNull()
    .default([]),
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
    orderIdx: index("creator_earnings_allocations_order_id_idx").on(
      table.orderId,
    ),
    providerEventUnique: uniqueIndex(
      "creator_earnings_allocations_provider_event_unique",
    ).on(table.providerEventReference),
    pendingOrderUnique: uniqueIndex(
      "creator_earnings_allocations_pending_order_unique",
    )
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
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
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
    providerEventUnique: unique("commerce_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    orderCreatedIndex: index("commerce_provider_events_order_created_idx").on(
      table.orderId,
      table.receivedAt,
    ),
    statusUpdatedIndex: index("commerce_provider_events_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
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
    sellerUpdatedIndex: index("creator_payout_events_seller_updated_idx").on(
      table.sellerUserId,
      table.updatedAt,
    ),
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
  productTypeSnapshot: text("product_type_snapshot")
    .notNull()
    .default("digital_download"),
  billingModelSnapshot: text("billing_model_snapshot")
    .notNull()
    .default("one_time"),
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
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    status: text("status").default("draft").notNull(),
    version: integer("version").default(1).notNull(),
    triggerType: text("trigger_type").default("manual").notNull(),
    triggerConfig: json("trigger_config")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    maxRunsPerHour: integer("max_runs_per_hour").default(20).notNull(),
    maxStepsPerRun: integer("max_steps_per_run").default(20).notNull(),
    retentionDays: integer("retention_days").default(90).notNull(),
    lastActivatedAt: timestamp("last_activated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerStatusIdx: index("automation_definitions_owner_status_idx").on(
      table.ownerUserId,
      table.status,
      table.updatedAt,
    ),
    businessStatusIdx: index("automation_definitions_business_status_idx").on(
      table.businessId,
      table.status,
    ),
  }),
);

export const automationSteps = pgTable(
  "automation_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .references(() => automationDefinitions.id, { onDelete: "cascade" })
      .notNull(),
    stepKey: text("step_key").notNull(),
    name: text("name").notNull(),
    actionType: text("action_type").notNull(),
    config: json("config")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    position: integer("position").notNull(),
    approvalPolicy: text("approval_policy").default("none").notNull(),
    retryLimit: integer("retry_limit").default(2).notNull(),
    timeoutMs: integer("timeout_ms").default(30_000).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    definitionStepKeyUnique: unique(
      "automation_steps_definition_key_unique",
    ).on(table.definitionId, table.stepKey),
    definitionPositionUnique: unique(
      "automation_steps_definition_position_unique",
    ).on(table.definitionId, table.position),
  }),
);

export const automationTriggerEvents = pgTable(
  "automation_trigger_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    payload: json("payload")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").default("pending").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    errorMessage: text("error_message"),
  },
  (table) => ({
    statusReceivedIdx: index(
      "automation_trigger_events_status_received_idx",
    ).on(table.status, table.receivedAt),
  }),
);

// Provider-neutral messaging consent and delivery state. Native CreativesOS
// conversations use channel="native"; provider adapters can reuse the same
// contract later without changing automation definitions.
export const automationContactStates = pgTable(
  "automation_contact_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    contactUserId: integer("contact_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    channel: text("channel").default("native").notNull(),
    conversationId: integer("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    optedOut: boolean("opted_out").default(false).notNull(),
    optedOutAt: timestamp("opted_out_at"),
    lastInboundAt: timestamp("last_inbound_at"),
    lastOutboundAt: timestamp("last_outbound_at"),
    cooldownUntil: timestamp("cooldown_until"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerContactChannelUnique: unique(
      "automation_contact_states_owner_contact_channel_unique",
    ).on(table.ownerUserId, table.contactUserId, table.channel),
    ownerUpdatedIdx: index("automation_contact_states_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .references(() => automationDefinitions.id, { onDelete: "restrict" })
      .notNull(),
    definitionVersion: integer("definition_version").notNull(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    initiatedByUserId: integer("initiated_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    triggerType: text("trigger_type").notNull(),
    triggerEventId: uuid("trigger_event_id").references(
      () => automationTriggerEvents.id,
      { onDelete: "set null" },
    ),
    threadId: uuid("thread_id").references(
      (): AnyPgColumn => automationThreads.id,
      { onDelete: "set null" },
    ),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").default("queued").notNull(),
    input: json("input").$type<Record<string, unknown>>().default({}).notNull(),
    output: json("output")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
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
    statusAttemptIdx: index("automation_runs_status_attempt_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    definitionCreatedIdx: index("automation_runs_definition_created_idx").on(
      table.definitionId,
      table.createdAt,
    ),
  }),
);

export const automationStepRuns = pgTable(
  "automation_step_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .references(() => automationRuns.id, { onDelete: "cascade" })
      .notNull(),
    stepId: uuid("step_id").references(() => automationSteps.id, {
      onDelete: "set null",
    }),
    stepKey: text("step_key").notNull(),
    actionType: text("action_type").notNull(),
    attempt: integer("attempt").default(1).notNull(),
    status: text("status").default("queued").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    input: json("input").$type<Record<string, unknown>>().default({}).notNull(),
    output: json("output")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
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
    runStepAttemptIdx: index("automation_step_runs_run_step_attempt_idx").on(
      table.runId,
      table.stepKey,
      table.attempt,
    ),
  }),
);

export const automationApprovals = pgTable(
  "automation_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .references(() => automationRuns.id, { onDelete: "cascade" })
      .notNull(),
    stepRunId: uuid("step_run_id")
      .references(() => automationStepRuns.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    requestedForUserId: integer("requested_for_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").default("pending").notNull(),
    reason: text("reason").notNull(),
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    expiresAt: timestamp("expires_at"),
    decidedByUserId: integer("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("automation_approvals_user_status_idx").on(
      table.requestedForUserId,
      table.status,
      table.createdAt,
    ),
  }),
);

// A receipt commits the native side effect and its replay result together.
// Recovering the same step after a worker crash therefore returns the original
// resource instead of creating it twice.
export const automationActionReceipts = pgTable("automation_action_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  stepRunId: uuid("step_run_id")
    .references(() => automationStepRuns.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  actionType: text("action_type").notNull(),
  output: json("output").$type<Record<string, unknown>>().default({}).notNull(),
  summary: text("summary").notNull(),
  costUnits: integer("cost_units").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const automationThreads = pgTable(
  "automation_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    definitionId: uuid("definition_id").references(
      () => automationDefinitions.id,
      { onDelete: "set null" },
    ),
    runId: uuid("run_id").references(() => automationRuns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    status: text("status").default("open").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("automation_threads_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const automationMessages = pgTable(
  "automation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .references(() => automationThreads.id, { onDelete: "cascade" })
      .notNull(),
    authorType: text("author_type").notNull(),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: text("kind").default("message").notNull(),
    content: text("content").notNull(),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    threadCreatedIdx: index("automation_messages_thread_created_idx").on(
      table.threadId,
      table.createdAt,
    ),
  }),
);

export const automationAuditEvents = pgTable(
  "automation_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    definitionId: uuid("definition_id").references(
      () => automationDefinitions.id,
      { onDelete: "set null" },
    ),
    runId: uuid("run_id").references(() => automationRuns.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runCreatedIdx: index("automation_audit_events_run_created_idx").on(
      table.runId,
      table.createdAt,
    ),
    actorCreatedIdx: index("automation_audit_events_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
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
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    userCommunityUnique: unique("user_community_unique").on(
      table.userId,
      table.communityId,
    ),
  }),
);

export const communityOnboardingQuestions = pgTable(
  "community_onboarding_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: integer("community_id")
      .references(() => communities.id, { onDelete: "cascade" })
      .notNull(),
    prompt: text("prompt").notNull(),
    kind: text("kind").notNull(),
    options: json("options")
      .$type<Array<{ id: string; label: string }>>()
      .default([])
      .notNull(),
    required: boolean("required").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    communityPositionIdx: index(
      "community_onboarding_questions_community_position_idx",
    ).on(table.communityId, table.position),
  }),
);

export const communityOnboardingResponses = pgTable(
  "community_onboarding_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    membershipId: integer("membership_id")
      .references(() => communityMemberships.id, { onDelete: "cascade" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => communityOnboardingQuestions.id, {
        onDelete: "restrict",
      })
      .notNull(),
    answer: json("answer").$type<string | string[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    membershipQuestionUnique: unique(
      "community_onboarding_responses_membership_question_unique",
    ).on(table.membershipId, table.questionId),
  }),
);

export const communityPointEvents = pgTable(
  "community_point_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: integer("community_id")
      .references(() => communities.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceUnique: unique("community_point_events_source_unique").on(
      table.communityId,
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
    communityCreatedIdx: index(
      "community_point_events_community_created_idx",
    ).on(table.communityId, table.createdAt),
  }),
);

export const communityBadges = pgTable(
  "community_badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: integer("community_id")
      .references(() => communities.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    icon: text("icon").default("sparkles").notNull(),
    pointsThreshold: integer("points_threshold").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    communityNameUnique: unique("community_badges_community_name_unique").on(
      table.communityId,
      table.name,
    ),
  }),
);

export const communityMemberBadges = pgTable(
  "community_member_badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: integer("community_id")
      .references(() => communities.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    badgeId: uuid("badge_id")
      .references(() => communityBadges.id, { onDelete: "cascade" })
      .notNull(),
    awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  },
  (table) => ({
    userBadgeUnique: unique("community_member_badges_user_badge_unique").on(
      table.userId,
      table.badgeId,
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

export const developerApiKeys = pgTable(
  "developer_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scopes: json("scopes").$type<string[]>().default([]).notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessCreatedIdx: index("developer_api_keys_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
  }),
);

export const developerApiRequests = pgTable(
  "developer_api_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    apiKeyId: uuid("api_key_id")
      .references(() => developerApiKeys.id, { onDelete: "set null" }),
    requestId: text("request_id").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessCreatedIdx: index("developer_api_requests_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
  }),
);

export const developerWebhookEndpoints = pgTable(
  "developer_webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    events: json("events").$type<string[]>().default([]).notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    status: text("status").default("active").notNull(),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    lastDeliveryAt: timestamp("last_delivery_at"),
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessStatusIdx: index("developer_webhook_endpoints_business_status_idx").on(
      table.businessId,
      table.status,
    ),
  }),
);

export const developerWebhookEvents = pgTable(
  "developer_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: json("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessIdempotencyUnique: unique("developer_webhook_events_business_idempotency_unique").on(
      table.businessId,
      table.idempotencyKey,
    ),
  }),
);

export const developerWebhookDeliveries = pgTable(
  "developer_webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .references(() => developerWebhookEvents.id, { onDelete: "cascade" })
      .notNull(),
    endpointId: uuid("endpoint_id")
      .references(() => developerWebhookEndpoints.id, { onDelete: "cascade" })
      .notNull(),
    attempt: integer("attempt").default(0).notNull(),
    status: text("status").default("pending").notNull(),
    responseCode: integer("response_code"),
    errorCode: text("error_code"),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    eventEndpointUnique: unique("developer_webhook_deliveries_event_endpoint_unique").on(
      table.eventId,
      table.endpointId,
    ),
    retryIdx: index("developer_webhook_deliveries_retry_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
  }),
);

export const operationalServiceEvents = pgTable(
  "operational_service_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    service: text("service").notNull(),
    success: boolean("success").notNull(),
    durationMs: integer("duration_ms").notNull(),
    statusCode: integer("status_code"),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceUnique: unique("operational_service_events_source_unique").on(
      table.sourceType,
      table.sourceId,
    ),
    businessServiceOccurredIdx: index("operational_service_events_business_service_occurred_idx").on(
      table.businessId,
      table.service,
      table.occurredAt,
    ),
  }),
);

export const operationalUsageEvents = pgTable(
  "operational_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    service: text("service").notNull(),
    metric: text("metric").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
    unit: text("unit").notNull(),
    estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" })
      .notNull()
      .default(0),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceUnique: unique("operational_usage_events_source_unique").on(
      table.sourceType,
      table.sourceId,
      table.metric,
    ),
    businessServiceOccurredIdx: index("operational_usage_events_business_service_occurred_idx").on(
      table.businessId,
      table.service,
      table.occurredAt,
    ),
  }),
);

export const operationalBudgets = pgTable(
  "operational_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    service: text("service").notNull(),
    softLimitMicros: bigint("soft_limit_micros", { mode: "number" })
      .notNull()
      .default(0),
    hardLimitMicros: bigint("hard_limit_micros", { mode: "number" })
      .notNull()
      .default(0),
    enabled: boolean("enabled").notNull().default(true),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessServiceUnique: unique("operational_budgets_business_service_unique").on(
      table.businessId,
      table.service,
    ),
  }),
);

// External activation evidence is append-only and business-scoped. A provider
// is never represented as qualified because credentials exist; every required
// acceptance stage must have current, referenced evidence in one explicit run.
export const providerActivationRuns = pgTable(
  "provider_activation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    environment: text("environment").notNull(),
    status: text("status").notNull().default("draft"),
    summary: text("summary").notNull().default(""),
    startedByUserId: integer("started_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    abandonedAt: timestamp("abandoned_at"),
    closedByUserId: integer("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessProviderEnvironmentIdx: index("provider_activation_runs_business_provider_environment_idx").on(
      table.businessId,
      table.provider,
      table.environment,
      table.startedAt,
    ),
    idBusinessUnique: unique("provider_activation_runs_id_business_unique").on(
      table.id,
      table.businessId,
    ),
    providerCheck: check(
      "provider_activation_runs_provider_check",
      sql`${table.provider} IN ('media_delivery', 'email_delivery', 'push_delivery', 'podcast_directories', 'youtube_distribution', 'facebook_distribution', 'instagram_distribution', 'tiktok_distribution', 'x_distribution', 'instagram_inbox', 'messenger_inbox', 'whatsapp_inbox', 'x_inbox', 'remote_guests', 'transcription', 'realtime_ai', 'relationship_ai', 'cloned_voice', 'broadcast_destinations', 'stripe_platform_commerce', 'stripe_creator_payouts', 'umh_federation')`,
    ),
    environmentCheck: check(
      "provider_activation_runs_environment_check",
      sql`${table.environment} IN ('sandbox', 'staging', 'production')`,
    ),
    statusCheck: check(
      "provider_activation_runs_status_check",
      sql`${table.status} IN ('draft', 'qualified', 'abandoned')`,
    ),
    completionCheck: check(
      "provider_activation_runs_completion_check",
      sql`((${table.status} = 'qualified') = (${table.completedAt} IS NOT NULL)) AND ((${table.status} = 'abandoned') = (${table.abandonedAt} IS NOT NULL))`,
    ),
  }),
);

export const providerActivationEvidence = pgTable(
  "provider_activation_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    stage: text("stage").notNull(),
    outcome: text("outcome").notNull(),
    evidenceUrl: text("evidence_url"),
    summary: text("summary").notNull(),
    observedAt: timestamp("observed_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    recordedByUserId: integer("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    runBusinessForeignKey: foreignKey({
      columns: [table.runId, table.businessId],
      foreignColumns: [providerActivationRuns.id, providerActivationRuns.businessId],
      name: "provider_activation_evidence_run_business_fk",
    }).onDelete("cascade"),
    runStageCreatedIdx: index("provider_activation_evidence_run_stage_created_idx").on(
      table.runId,
      table.stage,
      table.createdAt,
    ),
    businessCreatedIdx: index("provider_activation_evidence_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
    stageCheck: check(
      "provider_activation_evidence_stage_check",
      sql`${table.stage} IN ('connect', 'credential_custody', 'refresh_revoke', 'inbound', 'outbound', 'webhook_signature', 'idempotency', 'rate_limit', 'retry', 'dead_letter', 'receipt', 'privacy_export', 'deletion', 'failure_recovery')`,
    ),
    outcomeCheck: check(
      "provider_activation_evidence_outcome_check",
      sql`${table.outcome} IN ('passed', 'failed', 'blocked')`,
    ),
    passedReferenceCheck: check(
      "provider_activation_evidence_passed_reference_check",
      sql`${table.outcome} <> 'passed' OR ${table.evidenceUrl} IS NOT NULL`,
    ),
    expiryCheck: check(
      "provider_activation_evidence_expiry_check",
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.observedAt}`,
    ),
  }),
);

export const developerApiRateWindows = pgTable(
  "developer_api_rate_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id")
      .references(() => developerApiKeys.id, { onDelete: "cascade" })
      .notNull(),
    windowStartedAt: timestamp("window_started_at").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    keyWindowUnique: unique("developer_api_rate_windows_key_window_unique").on(
      table.apiKeyId,
      table.windowStartedAt,
    ),
    expiresIdx: index("developer_api_rate_windows_expires_idx").on(table.expiresAt),
  }),
);

export const developerOAuthApps = pgTable(
  "developer_oauth_apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerBusinessId: uuid("owner_business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    clientId: text("client_id").notNull().unique(),
    clientSecretHash: text("client_secret_hash").notNull(),
    redirectUris: json("redirect_uris").$type<string[]>().default([]).notNull(),
    scopes: json("scopes").$type<string[]>().default([]).notNull(),
    description: text("description").notNull().default(""),
    homepageUrl: text("homepage_url"),
    privacyUrl: text("privacy_url"),
    termsUrl: text("terms_url"),
    visibility: text("visibility").notNull().default("private"),
    reviewStatus: text("review_status").notNull().default("draft"),
    reviewNote: text("review_note"),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    publishedAt: timestamp("published_at"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerCreatedIdx: index("developer_oauth_apps_owner_created_idx").on(table.ownerBusinessId, table.createdAt),
  }),
);

export const developerOAuthInstallations = pgTable(
  "developer_oauth_installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").references(() => developerOAuthApps.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    installedByUserId: integer("installed_by_user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
    scopes: json("scopes").$type<string[]>().default([]).notNull(),
    status: text("status").notNull().default("active"),
    installedAt: timestamp("installed_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    appBusinessUnique: unique("developer_oauth_installations_app_business_unique").on(table.appId, table.businessId),
  }),
);

export const developerOAuthAuthorizationCodes = pgTable(
  "developer_oauth_authorization_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id").references(() => developerOAuthInstallations.id, { onDelete: "cascade" }).notNull(),
    codeHash: text("code_hash").notNull().unique(),
    redirectUri: text("redirect_uri").notNull(),
    scopes: json("scopes").$type<string[]>().default([]).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ expiresIdx: index("developer_oauth_authorization_codes_expires_idx").on(table.expiresAt) }),
);

export const developerOAuthAccessTokens = pgTable(
  "developer_oauth_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id").references(() => developerOAuthInstallations.id, { onDelete: "cascade" }).notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: json("scopes").$type<string[]>().default([]).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({ installationCreatedIdx: index("developer_oauth_access_tokens_installation_created_idx").on(table.installationId, table.createdAt) }),
);

export const developerOAuthRefreshTokens = pgTable(
  "developer_oauth_refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id").references(() => developerOAuthInstallations.id, { onDelete: "cascade" }).notNull(),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: json("scopes").$type<string[]>().default([]).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    rotatedAt: timestamp("rotated_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    familyIdx: index("developer_oauth_refresh_tokens_family_idx").on(table.familyId),
    installationIdx: index("developer_oauth_refresh_tokens_installation_idx").on(table.installationId),
  }),
);

export const developerOAuthRateWindows = pgTable(
  "developer_oauth_rate_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accessTokenId: uuid("access_token_id").references(() => developerOAuthAccessTokens.id, { onDelete: "cascade" }).notNull(),
    windowStartedAt: timestamp("window_started_at").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    tokenWindowUnique: unique("developer_oauth_rate_windows_token_window_unique").on(table.accessTokenId, table.windowStartedAt),
    expiresIdx: index("developer_oauth_rate_windows_expires_idx").on(table.expiresAt),
  }),
);

export const developerSandboxes = pgTable(
  "developer_sandboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").references(() => developerOAuthApps.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull().unique(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at").notNull(),
    lastResetAt: timestamp("last_reset_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({ appOwnerStatusIdx: index("developer_sandboxes_app_owner_status_idx").on(table.appId, table.ownerUserId, table.status) }),
);

export const dataImportJobs = pgTable(
  "data_import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    requestedByUserId: integer("requested_by_user_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
    sourceSystem: text("source_system").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    schemaVersion: text("schema_version").notNull(),
    status: text("status").notNull().default("completed"),
    summary: json("summary").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    businessIdempotencyUnique: unique("data_import_jobs_business_idempotency_unique").on(table.businessId, table.idempotencyKey),
    businessCreatedIdx: index("data_import_jobs_business_created_idx").on(table.businessId, table.createdAt),
  }),
);

export const dataImportRecords = pgTable(
  "data_import_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => dataImportJobs.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    sourceSystem: text("source_system").notNull(),
    domain: text("domain").notNull(),
    sourceId: text("source_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sourceUnique: unique("data_import_records_source_unique").on(table.businessId, table.sourceSystem, table.domain, table.sourceId),
    jobIdx: index("data_import_records_job_idx").on(table.jobId),
  }),
);

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
  // Stable across direct-upload URL refreshes and proxy fallback so a lost
  // completion response never creates a second Media Cloud asset.
  clientMutationId: text("client_mutation_id"),
  sha256: text("sha256"),
  deleteAfter: timestamp("delete_after"),
  metadata: json("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Media Cloud is the shared media plane for feed, marketplace, courses,
// CutStudio, Broadcast, UGC, distribution, and future projection instruments.
// Assets remain the canonical identity; these tables add durable processing,
// delivery, lineage, organization, and playback evidence without coupling the
// product to a particular storage or transcoding provider.
export const mediaProcessingJobs = pgTable(
  "media_processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("queued"),
    priority: integer("priority").notNull().default(50),
    progress: doublePrecision("progress").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    request: json("request")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    output: json("output")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    workerId: text("worker_id"),
    workerRegion: text("worker_region"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    heartbeatAt: timestamp("heartbeat_at"),
    cancellationRequestedAt: timestamp("cancellation_requested_at"),
    availableAt: timestamp("available_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    dispatchIdx: index("media_processing_jobs_dispatch_idx").on(
      table.state,
      table.priority,
      table.availableAt,
    ),
    assetCreatedIdx: index("media_processing_jobs_asset_created_idx").on(
      table.assetId,
      table.createdAt,
    ),
    ownerCreatedIdx: index("media_processing_jobs_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
    leaseIdx: index("media_processing_jobs_lease_idx").on(
      table.state,
      table.leaseExpiresAt,
    ),
    workerIdx: index("media_processing_jobs_worker_idx").on(
      table.workerId,
      table.state,
    ),
  }),
);

export const mediaWorkerNodes = pgTable(
  "media_worker_nodes",
  {
    id: text("id").primaryKey(),
    region: text("region").notNull(),
    status: text("status").notNull().default("active"),
    capabilities: json("capabilities").$type<string[]>().notNull().default([]),
    maxConcurrency: integer("max_concurrency").notNull().default(1),
    activeJobs: integer("active_jobs").notNull().default(0),
    version: text("version"),
    heartbeatAt: timestamp("heartbeat_at").defaultNow().notNull(),
    drainStartedAt: timestamp("drain_started_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    regionStatusHeartbeatIdx: index(
      "media_worker_nodes_region_status_heartbeat_idx",
    ).on(table.region, table.status, table.heartbeatAt),
    heartbeatIdx: index("media_worker_nodes_heartbeat_idx").on(
      table.heartbeatAt,
    ),
  }),
);

export const mediaRenditions = pgTable(
  "media_renditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    renditionKey: text("rendition_key").notNull(),
    role: text("role").notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    publicUrl: text("public_url"),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    bitrateKbps: integer("bitrate_kbps"),
    durationMs: integer("duration_ms"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    manifestType: text("manifest_type"),
    status: text("status").notNull().default("ready"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    assetKeyUnique: unique("media_renditions_asset_key_unique").on(
      table.assetId,
      table.renditionKey,
    ),
    assetRoleIdx: index("media_renditions_asset_role_idx").on(
      table.assetId,
      table.role,
      table.status,
    ),
  }),
);

export const mediaTextTracks = pgTable(
  "media_text_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(),
    language: text("language").notNull().default("en"),
    label: text("label").notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    publicUrl: text("public_url"),
    mimeType: text("mime_type").notNull().default("text/vtt"),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("ready"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    assetKindLanguageUnique: unique(
      "media_text_tracks_asset_kind_language_unique",
    ).on(table.assetId, table.kind, table.language),
    assetDefaultIdx: index("media_text_tracks_asset_default_idx").on(
      table.assetId,
      table.isDefault,
    ),
  }),
);

export const assetLineageEdges = pgTable(
  "asset_lineage_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentAssetId: uuid("parent_asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    childAssetId: uuid("child_asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    relationship: text("relationship").notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    edgeUnique: unique("asset_lineage_edges_edge_unique").on(
      table.parentAssetId,
      table.childAssetId,
      table.relationship,
    ),
    childIdx: index("asset_lineage_edges_child_idx").on(
      table.childAssetId,
      table.createdAt,
    ),
    parentIdx: index("asset_lineage_edges_parent_idx").on(
      table.parentAssetId,
      table.createdAt,
    ),
  }),
);

export const assetCollections = pgTable(
  "asset_collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("#1d9bf0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerNameUnique: unique("asset_collections_owner_name_unique").on(
      table.ownerUserId,
      table.name,
    ),
    ownerUpdatedIdx: index("asset_collections_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const assetCollectionItems = pgTable(
  "asset_collection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .references(() => assetCollections.id, { onDelete: "cascade" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    addedByUserId: integer("added_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    collectionAssetUnique: unique(
      "asset_collection_items_collection_asset_unique",
    ).on(table.collectionId, table.assetId),
    assetIdx: index("asset_collection_items_asset_idx").on(
      table.assetId,
      table.createdAt,
    ),
  }),
);

export const assetTags = pgTable(
  "asset_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    assetTagUnique: unique("asset_tags_asset_tag_unique").on(
      table.assetId,
      table.tag,
    ),
    ownerTagIdx: index("asset_tags_owner_tag_idx").on(
      table.ownerUserId,
      table.tag,
    ),
  }),
);

// Rights are first-class grants rather than loose asset metadata. A blocking
// claim (revoked, disputed, or expired) prevents new public/commercial usage
// while preserving the original and its evidence for audit and remediation.
export const assetRights = pgTable(
  "asset_rights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    rightsHolderName: text("rights_holder_name").notNull(),
    basis: text("basis").notNull().default("owner_declaration"),
    permittedUses: json("permitted_uses")
      .$type<string[]>()
      .notNull()
      .default(["all"]),
    territories: json("territories")
      .$type<string[]>()
      .notNull()
      .default(["worldwide"]),
    validFrom: timestamp("valid_from").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    status: text("status").notNull().default("active"),
    evidenceAssetId: uuid("evidence_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    syntheticMedia: boolean("synthetic_media").notNull().default(false),
    clonedVoice: boolean("cloned_voice").notNull().default(false),
    notes: text("notes").notNull().default(""),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    assetStatusIdx: index("asset_rights_asset_status_idx").on(
      table.assetId,
      table.status,
      table.expiresAt,
    ),
    ownerUpdatedIdx: index("asset_rights_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const assetUsageRecords = pgTable(
  "asset_usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    surfaceType: text("surface_type").notNull(),
    surfaceId: text("surface_id").notNull(),
    useType: text("use_type").notNull(),
    state: text("state").notNull().default("active"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    usageUnique: unique("asset_usage_records_usage_unique").on(
      table.assetId,
      table.surfaceType,
      table.surfaceId,
      table.useType,
    ),
    assetStartedIdx: index("asset_usage_records_asset_started_idx").on(
      table.assetId,
      table.startedAt,
    ),
    surfaceIdx: index("asset_usage_records_surface_idx").on(
      table.surfaceType,
      table.surfaceId,
    ),
  }),
);

export const mediaPlaybackSessions = pgTable(
  "media_playback_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    renditionId: uuid("rendition_id").references(() => mediaRenditions.id, {
      onDelete: "set null",
    }),
    viewerUserId: integer("viewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    clientSessionId: text("client_session_id").notNull(),
    playerVersion: text("player_version").notNull().default("web"),
    state: text("state").notNull().default("active"),
    watchMs: integer("watch_ms").notNull().default(0),
    lastPositionMs: integer("last_position_ms").notNull().default(0),
    lastEventKind: text("last_event_kind"),
    lastEventAt: timestamp("last_event_at"),
    rebufferCount: integer("rebuffer_count").notNull().default(0),
    rebufferMs: integer("rebuffer_ms").notNull().default(0),
    qualityChangeCount: integer("quality_change_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    viewerClientUnique: unique(
      "media_playback_sessions_viewer_client_unique",
    ).on(table.viewerUserId, table.clientSessionId),
    assetStartedIdx: index("media_playback_sessions_asset_started_idx").on(
      table.assetId,
      table.startedAt,
    ),
  }),
);

export const mediaPlaybackEvents = pgTable(
  "media_playback_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => mediaPlaybackSessions.id, { onDelete: "cascade" })
      .notNull(),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    positionMs: integer("position_ms").notNull().default(0),
    bufferedMs: integer("buffered_ms").notNull().default(0),
    bitrateKbps: integer("bitrate_kbps"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionSequenceUnique: unique(
      "media_playback_events_session_sequence_unique",
    ).on(table.sessionId, table.sequence),
    sessionOccurredIdx: index("media_playback_events_session_occurred_idx").on(
      table.sessionId,
      table.occurredAt,
    ),
  }),
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    anonymousId: text("anonymous_id"),
    sessionId: text("session_id").notNull(),
    eventName: text("event_name").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    objectType: text("object_type"),
    objectId: text("object_id"),
    source: text("source").notNull().default("web"),
    deduplicationKey: text("deduplication_key").notNull().unique(),
    consentState: text("consent_state").notNull().default("essential"),
    properties: json("properties")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (table) => ({
    businessOccurredIdx: index("analytics_events_business_occurred_idx").on(
      table.businessId,
      table.occurredAt,
    ),
    userOccurredIdx: index("analytics_events_user_occurred_idx").on(
      table.userId,
      table.occurredAt,
    ),
    objectOccurredIdx: index("analytics_events_object_occurred_idx").on(
      table.objectType,
      table.objectId,
      table.occurredAt,
    ),
  }),
);

export const analyticsIdentityLinks = pgTable(
  "analytics_identity_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    anonymousId: text("anonymous_id").notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    source: text("source").notNull().default("authenticated_session"),
    confidence: doublePrecision("confidence").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => ({
    identityUnique: unique(
      "analytics_identity_links_business_anonymous_user_unique",
    ).on(table.businessId, table.anonymousId, table.userId),
    userIdx: index("analytics_identity_links_user_idx").on(
      table.userId,
      table.lastSeenAt,
    ),
  }),
);

export const attributionTouches = pgTable(
  "attribution_touches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id, {
      onDelete: "cascade",
    }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    anonymousId: text("anonymous_id"),
    assetId: uuid("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    postId: integer("post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    distributionJobId: uuid("distribution_job_id").references(
      () => distributionJobs.id,
      { onDelete: "set null" },
    ),
    source: text("source").notNull(),
    medium: text("medium").notNull(),
    campaignName: text("campaign_name"),
    touchType: text("touch_type").notNull().default("view"),
    confidence: doublePrecision("confidence").notNull().default(1),
    deduplicationKey: text("deduplication_key").notNull().unique(),
    occurredAt: timestamp("occurred_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userOccurredIdx: index("attribution_touches_user_occurred_idx").on(
      table.userId,
      table.occurredAt,
    ),
    businessOccurredIdx: index("attribution_touches_business_occurred_idx").on(
      table.businessId,
      table.occurredAt,
    ),
  }),
);

export const conversionAttributions = pgTable(
  "conversion_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    touchId: uuid("touch_id")
      .references(() => attributionTouches.id, { onDelete: "restrict" })
      .notNull(),
    model: text("model").notNull().default("last_touch_30d"),
    credit: doublePrecision("credit").notNull().default(1),
    attributedRevenueCents: integer("attributed_revenue_cents")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orderTouchModelUnique: unique(
      "conversion_attributions_order_touch_model_unique",
    ).on(table.orderId, table.touchId, table.model),
    touchIdx: index("conversion_attributions_touch_idx").on(
      table.touchId,
      table.createdAt,
    ),
  }),
);

export const analyticsExperiments = pgTable(
  "analytics_experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    variants: json("variants")
      .$type<Array<{ key: string; weight: number }>>()
      .notNull(),
    guardrails: json("guardrails").$type<string[]>().notNull().default([]),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessKeyUnique: unique("analytics_experiments_business_key_unique").on(
      table.businessId,
      table.key,
    ),
  }),
);

export const analyticsExperimentAssignments = pgTable(
  "analytics_experiment_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .references(() => analyticsExperiments.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    variant: text("variant").notNull(),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  },
  (table) => ({
    assignmentUnique: unique(
      "analytics_experiment_assignments_experiment_user_unique",
    ).on(table.experimentId, table.userId),
  }),
);

export const creativeWorkItems = pgTable(
  "creative_work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    assigneeUserId: integer("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    parentWorkItemId: uuid("parent_work_item_id").references(
      (): AnyPgColumn => creativeWorkItems.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind").notNull().default("content"),
    status: text("status").notNull().default("idea"),
    priority: integer("priority").notNull().default(50),
    channel: text("channel"),
    startsAt: timestamp("starts_at"),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    recurrence: json("recurrence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessDueIdx: index("creative_work_items_business_due_idx").on(
      table.businessId,
      table.dueAt,
      table.status,
    ),
    assigneeDueIdx: index("creative_work_items_assignee_due_idx").on(
      table.assigneeUserId,
      table.dueAt,
    ),
    parentIdx: index("creative_work_items_parent_idx").on(
      table.parentWorkItemId,
    ),
    sourceUnique: uniqueIndex("creative_work_items_source_unique")
      .on(table.businessId, table.sourceType, table.sourceId)
      .where(sql`${table.sourceId} is not null`),
  }),
);

export const creativeWorkDependencies = pgTable(
  "creative_work_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .references(() => creativeWorkItems.id, { onDelete: "cascade" })
      .notNull(),
    dependsOnWorkItemId: uuid("depends_on_work_item_id")
      .references(() => creativeWorkItems.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    dependencyUnique: unique("creative_work_dependencies_unique").on(
      table.workItemId,
      table.dependsOnWorkItemId,
    ),
  }),
);

export const creativeWorkApprovals = pgTable(
  "creative_work_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .references(() => creativeWorkItems.id, { onDelete: "cascade" })
      .notNull(),
    requestedByUserId: integer("requested_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    reviewerUserId: integer("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    note: text("note").notNull().default(""),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (table) => ({
    itemPendingUnique: uniqueIndex(
      "creative_work_approvals_item_pending_unique",
    )
      .on(table.workItemId)
      .where(sql`${table.status} = 'pending'`),
  }),
);

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
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    sourceAssetId: uuid("source_asset_id")
      .references(() => assets.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    duration: doublePrecision("duration").notNull(),
    mediaKind: text("media_kind").notNull(),
    edl: json("edl").$type<import("./cut-studio").CutEdl>().notNull(),
    transcript: json("transcript").$type<
      import("./cut-studio").CutTranscript | null
    >(),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("cut_studio_projects_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
    businessUpdatedIdx: index("cut_studio_projects_business_updated_idx").on(
      table.businessId,
      table.updatedAt,
    ),
  }),
);

// Clean-room programmable compositions and provider-neutral cinematic plans.
// Source capsules are private assets and are never executed by the web process;
// execution requires a separately activated isolated runtime.
export const cutStudioCompositions = pgTable(
  "cut_studio_compositions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => cutStudioProjects.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    mode: text("mode").notNull().default("declarative"),
    manifest: json("manifest").$type<import("./cut-studio-production").CutCompositionManifest>().notNull(),
    codeCapsule: json("code_capsule").$type<import("./cut-studio-production").CutCodeCapsule | null>(),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectUpdatedIdx: index("cut_studio_compositions_project_updated_idx").on(table.projectId, table.updatedAt),
    businessUpdatedIdx: index("cut_studio_compositions_business_updated_idx").on(table.businessId, table.updatedAt),
  }),
);

export const cutStudioProductionPlans = pgTable(
  "cut_studio_production_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => cutStudioProjects.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    brief: json("brief").$type<import("./cut-studio-production").CutProductionBrief>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectUnique: unique("cut_studio_production_plans_project_unique").on(table.projectId),
    businessUpdatedIdx: index("cut_studio_production_plans_business_updated_idx").on(table.businessId, table.updatedAt),
  }),
);

export const cutStudioProductionElements = pgTable(
  "cut_studio_production_elements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id").references(() => cutStudioProductionPlans.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    spec: json("spec").$type<import("./cut-studio-production").CutProductionElementSpec>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    planUpdatedIdx: index("cut_studio_production_elements_plan_updated_idx").on(table.planId, table.updatedAt),
  }),
);

export const cutStudioShots = pgTable(
  "cut_studio_shots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id").references(() => cutStudioProductionPlans.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    sequence: integer("sequence").notNull(),
    spec: json("spec").$type<import("./cut-studio-production").CutShotSpec>().notNull(),
    selectedVariantId: uuid("selected_variant_id"),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("planned"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    planSequenceUnique: unique("cut_studio_shots_plan_sequence_unique").on(table.planId, table.sequence),
    planUpdatedIdx: index("cut_studio_shots_plan_updated_idx").on(table.planId, table.updatedAt),
  }),
);

export const cutStudioGenerationJobs = pgTable(
  "cut_studio_generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shotId: uuid("shot_id").references(() => cutStudioShots.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    request: json("request").$type<import("./cut-studio-production").CutGenerationRequest>().notNull(),
    state: text("state").notNull().default("provider_pending"),
    progress: doublePrecision("progress").notNull().default(0),
    detail: text("detail").notNull().default("Awaiting an activated model provider"),
    providerJobId: text("provider_job_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    attempt: integer("attempt").notNull().default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessIdempotencyUnique: unique("cut_studio_generation_jobs_business_idempotency_unique").on(table.businessId, table.idempotencyKey),
    shotCreatedIdx: index("cut_studio_generation_jobs_shot_created_idx").on(table.shotId, table.createdAt),
    stateUpdatedIdx: index("cut_studio_generation_jobs_state_updated_idx").on(table.state, table.updatedAt),
  }),
);

export const cutStudioGenerativeWorkflows = pgTable(
  "cut_studio_generative_workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => cutStudioProjects.id, { onDelete: "cascade" }).notNull(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    workflow: json("workflow").$type<import("./cut-studio-production").CutGenerativeWorkflow>().notNull(),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    projectUpdatedIdx: index("cut_studio_generative_workflows_project_updated_idx").on(table.projectId, table.updatedAt),
    businessUpdatedIdx: index("cut_studio_generative_workflows_business_updated_idx").on(table.businessId, table.updatedAt),
  }),
);

export const cutStudioShotVariants = pgTable(
  "cut_studio_shot_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shotId: uuid("shot_id").references(() => cutStudioShots.id, { onDelete: "cascade" }).notNull(),
    generationJobId: uuid("generation_job_id").references(() => cutStudioGenerationJobs.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "restrict" }),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    seed: integer("seed"),
    status: text("status").notNull().default("candidate"),
    provenance: json("provenance").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    shotCreatedIdx: index("cut_studio_shot_variants_shot_created_idx").on(table.shotId, table.createdAt),
  }),
);

// Portable mix decisions shared by every editor in a business. Templates are
// deliberately independent from project media and clip timing.
export const cutStudioAudioTemplates = pgTable(
  "cut_studio_audio_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    payload: json("payload")
      .$type<import("./cut-studio").CutAudioRoutingTemplatePayload>()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique(
      "cut_studio_audio_templates_business_name_unique",
    ).on(table.businessId, table.name),
    businessUpdatedIdx: index(
      "cut_studio_audio_templates_business_updated_idx",
    ).on(table.businessId, table.updatedAt),
    ownerUpdatedIdx: index("cut_studio_audio_templates_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const cutStudioProjectMedia = pgTable(
  "cut_studio_project_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => cutStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "restrict" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    mediaKind: text("media_kind").notNull(),
    duration: doublePrecision("duration").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectAssetUnique: unique(
      "cut_studio_project_media_project_asset_unique",
    ).on(table.projectId, table.assetId),
    projectCreatedIdx: index("cut_studio_project_media_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

export const cutStudioJobs = pgTable(
  "cut_studio_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => cutStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    retryOfJobId: uuid("retry_of_job_id").references((): AnyPgColumn => cutStudioJobs.id, { onDelete: "set null" }),
    detail: text("detail").notNull().default("Queued"),
    progress: doublePrecision("progress").notNull().default(0),
    request: json("request")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    output: json("output")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    artifactAssetId: uuid("artifact_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code"),
    workerId: text("worker_id"),
    workerRegion: text("worker_region"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    heartbeatAt: timestamp("heartbeat_at"),
    cancellationRequestedAt: timestamp("cancellation_requested_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({
    projectCreatedIdx: index("cut_studio_jobs_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    retryOfIdx: uniqueIndex("cut_studio_jobs_retry_of_idx").on(table.retryOfJobId),
    stateCreatedIdx: index("cut_studio_jobs_state_created_idx").on(
      table.state,
      table.createdAt,
    ),
    leaseIdx: index("cut_studio_jobs_lease_idx").on(
      table.state,
      table.leaseExpiresAt,
    ),
    workerIdx: index("cut_studio_jobs_worker_idx").on(
      table.workerId,
      table.state,
    ),
  }),
);

export const cutStudioVersions = pgTable(
  "cut_studio_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => cutStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    revision: integer("revision").notNull(),
    label: text("label").notNull(),
    edl: json("edl").$type<import("./cut-studio").CutEdl>().notNull(),
    transcript: json("transcript").$type<
      import("./cut-studio").CutTranscript | null
    >(),
    artifactAssetId: uuid("artifact_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    reviewStatus: text("review_status").notNull().default("pending"),
    approvedAt: timestamp("approved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectCreatedIdx: index("cut_studio_versions_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

export const cutStudioCollaborators = pgTable(
  "cut_studio_collaborators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => cutStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    invitedByUserId: integer("invited_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull().default("reviewer"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectUserUnique: unique(
      "cut_studio_collaborators_project_user_unique",
    ).on(table.projectId, table.userId),
  }),
);

export const cutStudioWorkspaceNotes = pgTable(
  "cut_studio_workspace_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => cutStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    authorUserId: integer("author_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    body: text("body").notNull(),
    positionMs: integer("position_ms").notNull().default(0),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    projectPositionIdx: index(
      "cut_studio_workspace_notes_project_position_idx",
    ).on(table.projectId, table.positionMs),
  }),
);

export const cutStudioReviewLinks = pgTable(
  "cut_studio_review_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .references(() => cutStudioVersions.id, { onDelete: "cascade" })
      .notNull(),
    projectId: uuid("project_id")
      .references(() => cutStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: unique("cut_studio_review_links_token_hash_unique").on(
      table.tokenHash,
    ),
    projectCreatedIdx: index("cut_studio_review_links_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

export const cutStudioReviewComments = pgTable(
  "cut_studio_review_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewLinkId: uuid("review_link_id")
      .references(() => cutStudioReviewLinks.id, { onDelete: "cascade" })
      .notNull(),
    versionId: uuid("version_id")
      .references(() => cutStudioVersions.id, { onDelete: "cascade" })
      .notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    positionMs: integer("position_ms").notNull().default(0),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    versionPositionIdx: index(
      "cut_studio_review_comments_version_position_idx",
    ).on(table.versionId, table.positionMs),
  }),
);

export const cutStudioReviewDecisions = pgTable(
  "cut_studio_review_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewLinkId: uuid("review_link_id")
      .references(() => cutStudioReviewLinks.id, { onDelete: "cascade" })
      .notNull(),
    versionId: uuid("version_id")
      .references(() => cutStudioVersions.id, { onDelete: "cascade" })
      .notNull(),
    reviewerName: text("reviewer_name").notNull(),
    decision: text("decision").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    versionCreatedIdx: index(
      "cut_studio_review_decisions_version_created_idx",
    ).on(table.versionId, table.createdAt),
  }),
);

export const broadcastStudios = pgTable(
  "broadcast_studios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    config: json("config")
      .$type<import("./broadcast-studio").BroadcastStudioConfig>()
      .notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("broadcast_studios_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const broadcastStudioCollaborators = pgTable(
  "broadcast_studio_collaborators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .references(() => broadcastStudios.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    invitedByUserId: integer("invited_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    studioUserUnique: unique(
      "broadcast_studio_collaborators_studio_user_unique",
    ).on(table.studioId, table.userId),
    userCreatedIdx: index("broadcast_studio_collaborators_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

// Immutable bounded snapshots make collaborative production changes
// recoverable without coupling rollback to the live studio row.
export const broadcastStudioVersions = pgTable(
  "broadcast_studio_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .references(() => broadcastStudios.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    config: json("config")
      .$type<import("./broadcast-studio").BroadcastStudioConfig>()
      .notNull(),
    reason: text("reason").notNull().default("save"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    studioRevisionUnique: unique(
      "broadcast_studio_versions_studio_revision_unique",
    ).on(table.studioId, table.revision),
    studioCreatedIdx: index("broadcast_studio_versions_studio_created_idx").on(
      table.studioId,
      table.createdAt,
    ),
  }),
);

// Capture nodes are portable contributors rather than provider accounts. A
// native Android app, desktop capture agent, remote guest, or dedicated encoder
// can pair once, publish replay-protected health, and receive a bounded remote
// encoding directive without gaining the creator's web session or destination
// credentials.
export const broadcastCaptureNodes = pgTable(
  "broadcast_capture_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .references(() => broadcastStudios.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("ready"),
    capabilities: json("capabilities")
      .$type<import("./broadcast-field").CaptureCapabilities>()
      .notNull(),
    configuration: json("configuration")
      .$type<import("./broadcast-field").CaptureNodeConfiguration>()
      .notNull(),
    deviceSecretHash: text("device_secret_hash").notNull(),
    lastTelemetry: json("last_telemetry").$type<
      import("./broadcast-field").CaptureTelemetry | null
    >(),
    lastDirective: json("last_directive").$type<
      import("./broadcast-field").CaptureEncodingDirective | null
    >(),
    lastSequence: integer("last_sequence").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    studioUpdatedIdx: index("broadcast_capture_nodes_studio_updated_idx").on(
      table.studioId,
      table.updatedAt,
    ),
    ownerUpdatedIdx: index("broadcast_capture_nodes_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
    deviceSecretUnique: unique(
      "broadcast_capture_nodes_device_secret_unique",
    ).on(table.deviceSecretHash),
  }),
);

export const broadcastCaptureInvitations = pgTable(
  "broadcast_capture_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .references(() => broadcastStudios.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    studioExpiresIdx: index(
      "broadcast_capture_invitations_studio_expires_idx",
    ).on(table.studioId, table.expiresAt),
  }),
);

// A bounded telemetry history supports field diagnosis and competitive network
// qualification while the latest snapshot remains directly available on the
// node. Device sequence numbers make retries idempotent and reject replay.
export const broadcastCaptureTelemetry = pgTable(
  "broadcast_capture_telemetry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id")
      .references(() => broadcastCaptureNodes.id, { onDelete: "cascade" })
      .notNull(),
    sequence: integer("sequence").notNull(),
    state: text("state").notNull(),
    snapshot: json("snapshot")
      .$type<import("./broadcast-field").CaptureTelemetry>()
      .notNull(),
    directive: json("directive")
      .$type<import("./broadcast-field").CaptureEncodingDirective>()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    nodeSequenceUnique: unique(
      "broadcast_capture_telemetry_node_sequence_unique",
    ).on(table.nodeId, table.sequence),
    nodeCreatedIdx: index("broadcast_capture_telemetry_node_created_idx").on(
      table.nodeId,
      table.createdAt,
    ),
  }),
);

// Brand identity is stored outside an individual studio so a creator can keep
// every show visually consistent without rebuilding colors and logos for each
// broadcast. The business key preserves a clean path to shared team libraries.
export const broadcastBrandKits = pgTable(
  "broadcast_brand_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    primaryColor: text("primary_color").notNull(),
    surfaceColor: text("surface_color").notNull(),
    textColor: text("text_color").notNull(),
    logoAssetId: uuid("logo_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerNameUnique: unique("broadcast_brand_kits_owner_name_unique").on(
      table.ownerUserId,
      table.name,
    ),
    ownerUpdatedIdx: index("broadcast_brand_kits_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
    businessUpdatedIdx: index("broadcast_brand_kits_business_updated_idx").on(
      table.businessId,
      table.updatedAt,
    ),
  }),
);

// Complete scenes and source configurations can be promoted from one studio
// into the business library, then instantiated with fresh runtime identifiers
// in any other studio owned by that business.
export const broadcastTemplateCatalog = pgTable(
  "broadcast_template_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    payload: json("payload")
      .$type<
        | import("./broadcast-studio").BroadcastScene
        | import("./broadcast-studio").BroadcastSource
      >()
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessKindNameUnique: unique(
      "broadcast_template_catalog_business_kind_name_unique",
    ).on(table.businessId, table.kind, table.name),
    businessUpdatedIdx: index(
      "broadcast_template_catalog_business_updated_idx",
    ).on(table.businessId, table.updatedAt),
    ownerUpdatedIdx: index("broadcast_template_catalog_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const broadcastDestinations = pgTable(
  "broadcast_destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    protocol: text("protocol").notNull(),
    ingestUrl: text("ingest_url").notNull(),
    streamKeyCiphertext: text("stream_key_ciphertext").notNull(),
    outputLayout: text("output_layout").notNull().default("program"),
    framingMode: text("framing_mode").notNull().default("fit"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerUpdatedIdx: index("broadcast_destinations_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const broadcastSessions = pgTable(
  "broadcast_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .references(() => broadcastStudios.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    destinationId: uuid("destination_id").references(
      () => broadcastDestinations.id,
      { onDelete: "set null" },
    ),
    destinationIds: json("destination_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    recordingAssetId: uuid("recording_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    outputMode: text("output_mode").notNull(),
    sourceMode: text("source_mode").notNull(),
    state: text("state").notNull().default("starting"),
    runtimeMachineId: text("runtime_machine_id"),
    health: json("health")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    studioCreatedIdx: index("broadcast_sessions_studio_created_idx").on(
      table.studioId,
      table.createdAt,
    ),
    ownerCreatedIdx: index("broadcast_sessions_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
  }),
);

export const broadcastSessionMarkers = pgTable(
  "broadcast_session_markers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => broadcastSessions.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull().default("highlight"),
    label: text("label").notNull().default("Highlight"),
    positionMs: integer("position_ms").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionPositionIdx: index(
      "broadcast_session_markers_session_position_idx",
    ).on(table.sessionId, table.positionMs),
  }),
);

// Native audience messages share one moderated session timeline with future
// provider adapters. Only visible items can enter the program canvas; featuring
// and moderation remain explicit owner actions with durable evidence.
export const broadcastAudienceMessages = pgTable(
  "broadcast_audience_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => broadcastSessions.id, { onDelete: "cascade" })
      .notNull(),
    authorUserId: integer("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull().default("native"),
    externalMessageId: text("external_message_id"),
    kind: text("kind").notNull().default("comment"),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    actionUrl: text("action_url"),
    status: text("status").notNull().default("visible"),
    featured: boolean("featured").notNull().default(false),
    moderatedByUserId: integer("moderated_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    moderatedAt: timestamp("moderated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index(
      "broadcast_audience_messages_session_created_idx",
    ).on(table.sessionId, table.createdAt),
    providerExternalUnique: uniqueIndex(
      "broadcast_audience_messages_provider_external_unique",
    ).on(table.sessionId, table.provider, table.externalMessageId),
  }),
);

// Isolated source recordings preserve the camera, screen, or microphone feed
// alongside the composited program. Bytes remain private assets; this table is
// the durable, owner-scoped recording manifest used by Broadcast and CutStudio.
export const broadcastSessionTracks = pgTable(
  "broadcast_session_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => broadcastSessions.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceType: text("source_type").notNull(),
    mimeType: text("mime_type").notNull(),
    durationMs: integer("duration_ms").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    quality: json("quality")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionSourceUnique: unique(
      "broadcast_session_tracks_session_source_unique",
    ).on(table.sessionId, table.sourceId),
    sessionCreatedIdx: index("broadcast_session_tracks_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    ownerCreatedIdx: index("broadcast_session_tracks_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt,
    ),
  }),
);

export const broadcastDestinationReceipts = pgTable(
  "broadcast_destination_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => broadcastSessions.id, { onDelete: "cascade" })
      .notNull(),
    destinationId: uuid("destination_id").references(
      () => broadcastDestinations.id,
      { onDelete: "set null" },
    ),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    destinationName: text("destination_name").notNull(),
    state: text("state").notNull().default("starting"),
    detail: text("detail").notNull().default("Encoder is starting"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionDestinationUnique: unique(
      "broadcast_destination_receipts_session_destination_unique",
    ).on(table.sessionId, table.destinationId),
    sessionUpdatedIdx: index(
      "broadcast_destination_receipts_session_updated_idx",
    ).on(table.sessionId, table.updatedAt),
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
  kind: text("kind").notNull().default("note"),
  visibility: text("visibility").notNull().default("members"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const communityRoomEvents = pgTable(
  "community_room_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    communityId: integer("community_id")
      .references(() => communities.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    subjectUserId: integer("subject_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    payload: json("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    roomCreatedIdx: index("community_room_events_room_created_idx").on(
      table.roomId,
      table.createdAt,
    ),
    communityCreatedIdx: index("community_room_events_community_created_idx").on(
      table.communityId,
      table.createdAt,
    ),
  }),
);

export const communityRoomGuestInvites = pgTable(
  "community_room_guest_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .references(() => communityRooms.id, { onDelete: "cascade" })
      .notNull(),
    invitedByUserId: integer("invited_by_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    guestUserId: integer("guest_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    email: text("email"),
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status").notNull().default("invited"),
    membershipGranted: boolean("membership_granted").notNull().default(false),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    admittedAt: timestamp("admitted_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    roomStatusIdx: index("community_room_guest_invites_room_status_idx").on(
      table.roomId,
      table.status,
      table.createdAt,
    ),
  }),
);

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
    visibleAiEnabled: boolean("visible_ai_enabled").notNull().default(false),
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
    aiAnalysisAllowed: boolean("ai_analysis_allowed").notNull().default(false),
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

export const communityRoomAiProfiles = pgTable("community_room_ai_profiles", {
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
});

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
  evidence: json("evidence")
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default([]),
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
    oneActivePerRoom: uniqueIndex(
      "community_room_recordings_one_active_per_room",
    )
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

// Canonical standalone instrument envelope shared by Docs, Sheets, Slides,
// Tables, Forms, Calendar, and Finance. Product-specific surfaces bind to this
// authority rather than defining incompatible lifecycle or revision rules.
export const foundationInstruments = pgTable(
  "foundation_instruments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schemaVersion: integer("schema_version").notNull().default(1),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    currentRevision: integer("current_revision").notNull().default(1),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    authorityScope: text("authority_scope").notNull().default("business"),
    extension: json("extension").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    businessKindIdx: index("foundation_instruments_business_kind_idx").on(table.businessId, table.kind),
    businessStatusIdx: index("foundation_instruments_business_status_idx").on(table.businessId, table.status),
  }),
);

export const foundationInstrumentRevisions = pgTable(
  "foundation_instrument_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .references(() => foundationInstruments.id, { onDelete: "cascade" })
      .notNull(),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    content: json("content").$type<unknown>().notNull(),
    actorUserId: integer("actor_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    changeSummary: text("change_summary").notNull(),
    baseRevision: integer("base_revision"),
    evidence: json("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    revisionUnique: unique("foundation_instrument_revision_unique").on(table.instrumentId, table.revision),
    instrumentRevisionIdx: index("foundation_instrument_revision_idx").on(table.instrumentId, table.revision),
  }),
);

export const foundationInstrumentEvents = pgTable(
  "foundation_instrument_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .references(() => foundationInstruments.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorUserId: integer("actor_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    payload: json("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    instrumentCreatedIdx: index("foundation_instrument_events_created_idx").on(table.instrumentId, table.createdAt),
  }),
);

export const foundationFormSubmissions = pgTable(
  "foundation_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formInstrumentId: uuid("form_instrument_id")
      .references(() => foundationInstruments.id, { onDelete: "cascade" })
      .notNull(),
    databaseInstrumentId: uuid("database_instrument_id")
      .references(() => foundationInstruments.id, { onDelete: "restrict" })
      .notNull(),
    submittedByUserId: integer("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    values: json("values").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    formIdempotencyUnique: unique("foundation_form_submission_idempotency_unique").on(table.formInstrumentId, table.idempotencyKey),
  }),
);

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

// Audience identity extends the canonical Relationship Hub subject rather than
// introducing a second contact database for newsletters and notifications.
export const audienceProfiles = pgTable(
  "audience_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    subscriberStatus: text("subscriber_status").notNull().default("prospect"),
    lifecycleState: text("lifecycle_state").notNull().default("new"),
    acquisitionSource: text("acquisition_source").notNull().default("manual"),
    interests: json("interests").$type<string[]>().notNull().default([]),
    engagementScore: doublePrecision("engagement_score").notNull().default(0),
    fields: json("fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    subscribedAt: timestamp("subscribed_at"),
    unsubscribedAt: timestamp("unsubscribed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipUnique: unique("audience_profiles_relationship_unique").on(
      table.businessId,
      table.relationshipId,
    ),
    lifecycleIdx: index("audience_profiles_lifecycle_idx").on(
      table.businessId,
      table.subscriberStatus,
      table.lifecycleState,
    ),
  }),
);

export const audienceSegments = pgTable(
  "audience_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    filter: json("filter")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique("audience_segments_business_name_unique").on(
      table.businessId,
      table.name,
    ),
  }),
);

export const audienceSegmentMemberships = pgTable(
  "audience_segment_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    segmentId: uuid("segment_id")
      .references(() => audienceSegments.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    segmentRelationshipUnique: unique("audience_segment_memberships_unique").on(
      table.segmentId,
      table.relationshipId,
    ),
  }),
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    relationshipId: uuid("relationship_id").references(() => relationships.id, {
      onDelete: "cascade",
    }),
    channel: text("channel").notNull(),
    purpose: text("purpose").notNull().default("product"),
    enabled: boolean("enabled").notNull().default(true),
    quietHoursStart: text("quiet_hours_start"),
    quietHoursEnd: text("quiet_hours_end"),
    timezone: text("timezone").notNull().default("UTC"),
    digestCadence: text("digest_cadence").notNull().default("immediate"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userPreferenceUnique: uniqueIndex("notification_preferences_user_unique")
      .on(table.businessId, table.userId, table.channel, table.purpose)
      .where(sql`${table.userId} is not null`),
    relationshipPreferenceUnique: uniqueIndex(
      "notification_preferences_relationship_unique",
    )
      .on(table.businessId, table.relationshipId, table.channel, table.purpose)
      .where(sql`${table.relationshipId} is not null`),
  }),
);

export const notificationEvents = pgTable(
  "notification_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    recipientUserId: integer("recipient_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    relationshipId: uuid("relationship_id").references(() => relationships.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    linkTo: text("link_to"),
    purpose: text("purpose").notNull().default("product"),
    urgency: text("urgency").notNull().default("normal"),
    data: json("data").$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull().default("accepted"),
    scheduledAt: timestamp("scheduled_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    businessDedupeUnique: unique(
      "notification_events_business_dedupe_unique",
    ).on(table.businessId, table.dedupeKey),
    dueIdx: index("notification_events_due_idx").on(
      table.status,
      table.scheduledAt,
    ),
  }),
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .references(() => notificationEvents.id, { onDelete: "cascade" })
      .notNull(),
    channel: text("channel").notNull(),
    adapter: text("adapter").notNull(),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    providerReceiptId: text("provider_receipt_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    openedAt: timestamp("opened_at"),
    clickedAt: timestamp("clicked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    eventChannelUnique: unique(
      "notification_deliveries_event_channel_unique",
    ).on(table.eventId, table.channel),
    dueIdx: index("notification_deliveries_due_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
  }),
);

export const notificationSuppressions = pgTable(
  "notification_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    relationshipId: uuid("relationship_id").references(() => relationships.id, {
      onDelete: "cascade",
    }),
    channel: text("channel").notNull(),
    purpose: text("purpose").notNull().default("all"),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    recipientIdx: index("notification_suppressions_recipient_idx").on(
      table.businessId,
      table.userId,
      table.relationshipId,
      table.channel,
    ),
  }),
);

// Push-provider tokens are encrypted at rest and are never projected through
// public API fields. The installation id is app-generated and contains no
// hardware identifier, advertising id, or device fingerprint.
export const mobileDeviceRegistrations = pgTable(
  "mobile_device_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    installationId: text("installation_id").notNull(),
    platform: text("platform").notNull(),
    pushProvider: text("push_provider").notNull(),
    pushTokenHash: text("push_token_hash").notNull(),
    pushTokenCiphertext: text("push_token_ciphertext").notNull(),
    appVersion: text("app_version"),
    status: text("status").notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    userInstallationUnique: unique(
      "mobile_device_registrations_user_installation_unique",
    ).on(table.userId, table.installationId),
    activeTokenHashUnique: uniqueIndex(
      "mobile_device_registrations_active_token_hash_unique",
    )
      .on(table.pushTokenHash)
      .where(sql`${table.status} = 'active'`),
    userStatusIdx: index("mobile_device_registrations_user_status_idx").on(
      table.userId,
      table.status,
    ),
    platformProviderCheck: check(
      "mobile_device_registrations_platform_provider_check",
      sql`(${table.platform} = 'ios' AND ${table.pushProvider} = 'apns') OR (${table.platform} = 'android' AND ${table.pushProvider} = 'fcm')`,
    ),
    platformCheck: check(
      "mobile_device_registrations_platform_check",
      sql`${table.platform} IN ('ios', 'android')`,
    ),
    providerCheck: check(
      "mobile_device_registrations_provider_check",
      sql`${table.pushProvider} IN ('apns', 'fcm')`,
    ),
    statusCheck: check(
      "mobile_device_registrations_status_check",
      sql`${table.status} IN ('active', 'revoked')`,
    ),
  }),
);

// Audience Studio owns capture and publishing workflow while the canonical
// relationship record remains the identity system of record.
export const audienceForms = pgTable(
  "audience_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    publicId: text("public_id").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    fields: json("fields")
      .$type<
        Array<{
          key: string;
          label: string;
          type: string;
          required: boolean;
          options?: string[];
        }>
      >()
      .notNull()
      .default([]),
    tags: json("tags").$type<string[]>().notNull().default([]),
    consentPurpose: text("consent_purpose").notNull().default("marketing"),
    disclosureVersion: text("disclosure_version").notNull().default("v1"),
    successMessage: text("success_message")
      .notNull()
      .default("You are subscribed."),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique("audience_forms_business_name_unique").on(
      table.businessId,
      table.name,
    ),
    statusIdx: index("audience_forms_status_idx").on(
      table.businessId,
      table.status,
    ),
  }),
);

export const audienceFormSubmissions = pgTable(
  "audience_form_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .references(() => audienceForms.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull(),
    values: json("values")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    consentGranted: boolean("consent_granted").notNull().default(false),
    source: text("source").notNull().default("form"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  },
  (table) => ({
    formRelationshipUnique: unique(
      "audience_form_submissions_form_relationship_unique",
    ).on(table.formId, table.relationshipId),
    formSubmittedIdx: index("audience_form_submissions_form_idx").on(
      table.formId,
      table.submittedAt,
    ),
  }),
);

export const audienceLandingPages = pgTable(
  "audience_landing_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    formId: uuid("form_id").references(() => audienceForms.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    publicId: text("public_id").notNull().unique(),
    headline: text("headline").notNull(),
    subheadline: text("subheadline").notNull().default(""),
    sections: json("sections")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    theme: json("theme").$type<Record<string, unknown>>().notNull().default({}),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique(
      "audience_landing_pages_business_name_unique",
    ).on(table.businessId, table.name),
    statusIdx: index("audience_landing_pages_status_idx").on(
      table.businessId,
      table.status,
    ),
  }),
);

export const newsletterBlocks = pgTable(
  "newsletter_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    content: json("content")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique("newsletter_blocks_business_name_unique").on(
      table.businessId,
      table.name,
    ),
  }),
);

export const newsletterIssues = pgTable(
  "newsletter_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    segmentId: uuid("segment_id").references(() => audienceSegments.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    previewText: text("preview_text").notNull().default(""),
    content: json("content")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    variants: json("variants")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at"),
    sentAt: timestamp("sent_at"),
    winnerVariant: text("winner_variant"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("newsletter_issues_status_idx").on(
      table.businessId,
      table.status,
      table.scheduledAt,
    ),
  }),
);

export const newsletterSequences = pgTable(
  "newsletter_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    trigger: json("trigger")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique("newsletter_sequences_business_name_unique").on(
      table.businessId,
      table.name,
    ),
  }),
);

export const newsletterSequenceSteps = pgTable(
  "newsletter_sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .references(() => newsletterSequences.id, { onDelete: "cascade" })
      .notNull(),
    position: integer("position").notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    subject: text("subject").notNull(),
    previewText: text("preview_text").notNull().default(""),
    content: json("content")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sequencePositionUnique: unique(
      "newsletter_sequence_steps_position_unique",
    ).on(table.sequenceId, table.position),
  }),
);

export const newsletterEnrollments = pgTable(
  "newsletter_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .references(() => newsletterSequences.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").notNull().default("active"),
    nextStepPosition: integer("next_step_position").notNull().default(1),
    nextRunAt: timestamp("next_run_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sequenceRelationshipUnique: unique(
      "newsletter_enrollments_sequence_relationship_unique",
    ).on(table.sequenceId, table.relationshipId),
    dueIdx: index("newsletter_enrollments_due_idx").on(
      table.status,
      table.nextRunAt,
    ),
  }),
);

export const audiencePreferenceTokens = pgTable(
  "audience_preference_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    relationshipId: uuid("relationship_id")
      .references(() => relationships.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    relationshipIdx: index("audience_preference_tokens_relationship_idx").on(
      table.businessId,
      table.relationshipId,
      table.expiresAt,
    ),
  }),
);

export const podcastShows = pgTable(
  "podcast_shows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    publicId: text("public_id").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    author: text("author").notNull(),
    ownerEmail: text("owner_email").notNull(),
    language: text("language").notNull().default("en"),
    category: text("category").notNull().default("Society & Culture"),
    explicit: boolean("explicit").notNull().default(false),
    artworkAssetId: uuid("artwork_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    websiteUrl: text("website_url"),
    copyright: text("copyright").notNull().default(""),
    access: text("access").notNull().default("public"),
    entitlementProductId: integer("entitlement_product_id").references(
      () => products.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("draft"),
    redirectUrl: text("redirect_url"),
    importedFromUrl: text("imported_from_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessTitleUnique: unique("podcast_shows_business_title_unique").on(
      table.businessId,
      table.title,
    ),
    statusIdx: index("podcast_shows_status_idx").on(
      table.businessId,
      table.status,
    ),
  }),
);

export const podcastSeasons = pgTable(
  "podcast_seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    showId: uuid("show_id")
      .references(() => podcastShows.id, { onDelete: "cascade" })
      .notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    artworkAssetId: uuid("artwork_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    showNumberUnique: unique("podcast_seasons_show_number_unique").on(
      table.showId,
      table.number,
    ),
  }),
);

export const podcastEpisodes = pgTable(
  "podcast_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    showId: uuid("show_id")
      .references(() => podcastShows.id, { onDelete: "cascade" })
      .notNull(),
    seasonId: uuid("season_id").references(() => podcastSeasons.id, {
      onDelete: "set null",
    }),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    publicId: text("public_id").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    episodeType: text("episode_type").notNull().default("full"),
    episodeNumber: integer("episode_number"),
    mediaAssetId: uuid("media_asset_id")
      .references(() => assets.id, { onDelete: "restrict" })
      .notNull(),
    videoAssetId: uuid("video_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    artworkAssetId: uuid("artwork_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    chapters: json("chapters")
      .$type<Array<{ startSeconds: number; title: string; url?: string }>>()
      .notNull()
      .default([]),
    sponsorshipMarkers: json("sponsorship_markers")
      .$type<
        Array<{
          startSeconds: number;
          endSeconds: number;
          sponsor: string;
          disclosure: string;
        }>
      >()
      .notNull()
      .default([]),
    explicit: boolean("explicit").notNull().default(false),
    access: text("access").notNull().default("show_default"),
    durationSeconds: integer("duration_seconds"),
    status: text("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    showStatusIdx: index("podcast_episodes_show_status_idx").on(
      table.showId,
      table.status,
      table.publishedAt,
    ),
    showNumberUnique: unique("podcast_episodes_show_number_unique").on(
      table.showId,
      table.episodeNumber,
    ),
  }),
);

export const podcastDestinations = pgTable(
  "podcast_destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    showId: uuid("show_id")
      .references(() => podcastShows.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    status: text("status").notNull().default("pending"),
    feedUrl: text("feed_url"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    showProviderUnique: unique("podcast_destinations_show_provider_unique").on(
      table.showId,
      table.provider,
    ),
  }),
);

export const podcastPrivateFeedTokens = pgTable(
  "podcast_private_feed_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    showId: uuid("show_id")
      .references(() => podcastShows.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    showUserIdx: index("podcast_private_feed_tokens_show_user_idx").on(
      table.showId,
      table.userId,
      table.expiresAt,
    ),
  }),
);

export const podcastEpisodeComments = pgTable(
  "podcast_episode_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .references(() => podcastEpisodes.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => podcastEpisodeComments.id,
      { onDelete: "cascade" },
    ),
    body: text("body").notNull(),
    status: text("status").notNull().default("visible"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    episodeCreatedIdx: index("podcast_episode_comments_episode_idx").on(
      table.episodeId,
      table.createdAt,
    ),
  }),
);

export const podcastPolls = pgTable("podcast_polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  episodeId: uuid("episode_id")
    .references(() => podcastEpisodes.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  question: text("question").notNull(),
  options: json("options")
    .$type<Array<{ id: string; label: string }>>()
    .notNull(),
  status: text("status").notNull().default("open"),
  closesAt: timestamp("closes_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const podcastPollVotes = pgTable(
  "podcast_poll_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .references(() => podcastPolls.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    optionId: text("option_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pollUserUnique: unique("podcast_poll_votes_poll_user_unique").on(
      table.pollId,
      table.userId,
    ),
  }),
);

export const designProjects = pgTable(
  "design_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    brandKitId: uuid("brand_kit_id").references(() => broadcastBrandKits.id, {
      onDelete: "set null",
    }),
    document: json("document")
      .$type<import("./design-studio").DesignDocument>()
      .notNull(),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("draft"),
    sourceProjectId: uuid("source_project_id").references(
      (): AnyPgColumn => designProjects.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessUpdatedIdx: index("design_projects_business_updated_idx").on(
      table.businessId,
      table.updatedAt,
    ),
  }),
);

export const designTemplates = pgTable(
  "design_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    document: json("document")
      .$type<import("./design-studio").DesignDocument>()
      .notNull(),
    lockedElementIds: json("locked_element_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique("design_templates_business_name_unique").on(
      table.businessId,
      table.name,
    ),
  }),
);

export const designVersions = pgTable(
  "design_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => designProjects.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    revision: integer("revision").notNull(),
    label: text("label").notNull(),
    document: json("document")
      .$type<import("./design-studio").DesignDocument>()
      .notNull(),
    reviewStatus: text("review_status").notNull().default("draft"),
    artifactAssetId: uuid("artifact_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectRevisionUnique: unique("design_versions_project_revision_unique").on(
      table.projectId,
      table.revision,
    ),
  }),
);

export const creativeWorkEvents = pgTable(
  "creative_work_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .references(() => creativeWorkItems.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    version: integer("version"),
    payload: json("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemCreatedIdx: index("creative_work_events_item_created_idx").on(
      table.workItemId,
      table.createdAt,
    ),
    businessCreatedIdx: index("creative_work_events_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
  }),
);

// Vision is the projection-local perception and capture instrument. Raw camera
// frames remain ephemeral by default; durable rows contain operator intent,
// grounded metadata, expiring watches, and an immutable control ledger.
export const visionPresets = pgTable(
  "vision_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    source: text("source").notNull().default("camera"),
    quality: text("quality").notNull().default("balanced"),
    settings: json("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    version: integer("version").notNull().default(1),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessLabelUnique: uniqueIndex("vision_presets_business_label_active_unique")
      .on(table.businessId, table.label)
      .where(sql`${table.archivedAt} is null`),
    ownerUpdatedIdx: index("vision_presets_owner_updated_idx").on(
      table.ownerUserId,
      table.updatedAt,
    ),
  }),
);

export const visionSessions = pgTable(
  "vision_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    source: text("source").notNull().default("camera"),
    quality: text("quality").notNull().default("balanced"),
    status: text("status").notNull().default("ready"),
    activePresetId: uuid("active_preset_id").references(() => visionPresets.id, {
      onDelete: "set null",
    }),
    followTarget: text("follow_target"),
    captureNoticeAcknowledgedAt: timestamp("capture_notice_acknowledged_at"),
    startedAt: timestamp("started_at"),
    stoppedAt: timestamp("stopped_at"),
    lastInteractionAt: timestamp("last_interaction_at").defaultNow().notNull(),
    lastFrameAt: timestamp("last_frame_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessUpdatedIdx: index("vision_sessions_business_updated_idx").on(
      table.businessId,
      table.updatedAt,
    ),
    ownerStatusIdx: index("vision_sessions_owner_status_idx").on(
      table.ownerUserId,
      table.status,
    ),
  }),
);

export const visionObservations = pgTable(
  "vision_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => visionSessions.id, { onDelete: "cascade" })
      .notNull(),
    frameId: text("frame_id").notNull(),
    kind: text("kind").notNull(),
    label: text("label"),
    summary: text("summary").notNull().default(""),
    confidence: doublePrecision("confidence").notNull().default(1),
    source: text("source").notNull(),
    operatorConfirmed: boolean("operator_confirmed").notNull().default(false),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    metrics: json("metrics")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    sessionCapturedIdx: index("vision_observations_session_captured_idx").on(
      table.sessionId,
      table.capturedAt,
    ),
    frameUnique: unique("vision_observations_session_frame_kind_unique").on(
      table.sessionId,
      table.frameId,
      table.kind,
    ),
  }),
);

export const visionWatches = pgTable(
  "vision_watches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => visionSessions.id, { onDelete: "cascade" })
      .notNull(),
    target: text("target").notNull(),
    condition: text("condition").notNull().default("moved"),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at").notNull(),
    stoppedAt: timestamp("stopped_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionStatusIdx: index("vision_watches_session_status_idx").on(
      table.sessionId,
      table.status,
      table.expiresAt,
    ),
  }),
);

export const visionEvents = pgTable(
  "vision_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => visionSessions.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    version: integer("version"),
    payload: json("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index("vision_events_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    businessCreatedIdx: index("vision_events_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
  }),
);

export const designProjectEvents = pgTable(
  "design_project_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => designProjects.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revision: integer("revision"),
    payload: json("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectCreatedIdx: index("design_project_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    businessCreatedIdx: index("design_project_events_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
  }),
);

export const designCollaborators = pgTable(
  "design_collaborators",
  {
    projectId: uuid("project_id")
      .references(() => designProjects.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectUserUnique: unique("design_collaborators_project_user_unique").on(
      table.projectId,
      table.userId,
    ),
  }),
);

export const designReviewLinks = pgTable("design_review_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .references(() => designVersions.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const designReviewComments = pgTable("design_review_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewLinkId: uuid("review_link_id")
    .references(() => designReviewLinks.id, { onDelete: "cascade" })
    .notNull(),
  versionId: uuid("version_id")
    .references(() => designVersions.id, { onDelete: "cascade" })
    .notNull(),
  reviewerName: text("reviewer_name").notNull(),
  body: text("body").notNull(),
  pageId: text("page_id").notNull(),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const designReviewDecisions = pgTable("design_review_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewLinkId: uuid("review_link_id")
    .references(() => designReviewLinks.id, { onDelete: "cascade" })
    .notNull(),
  versionId: uuid("version_id")
    .references(() => designVersions.id, { onDelete: "cascade" })
    .notNull(),
  reviewerName: text("reviewer_name").notNull(),
  decision: text("decision").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const designExports = pgTable(
  "design_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => designProjects.id, { onDelete: "cascade" })
      .notNull(),
    versionId: uuid("version_id").references(() => designVersions.id, {
      onDelete: "set null",
    }),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "restrict" })
      .notNull(),
    format: text("format").notNull(),
    pageId: text("page_id").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    projectCreatedIdx: index("design_exports_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  }),
);

export const creatorSites = pgTable("creator_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  ownerUserId: integer("owner_user_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  publicId: text("public_id").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  avatarAssetId: uuid("avatar_asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  theme: json("theme")
    .$type<import("./creator-site").CreatorSiteTheme>()
    .notNull(),
  seo: json("seo").$type<import("./creator-site").CreatorSiteSeo>().notNull(),
  status: text("status").notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const creatorSiteSections = pgTable(
  "creator_site_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .references(() => creatorSites.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    payload: json("payload")
      .$type<import("./creator-site").CreatorSiteSectionPayload>()
      .notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    visibility: text("visibility").notNull().default("public"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    siteOrderUnique: unique("creator_site_sections_site_order_unique").on(
      table.siteId,
      table.sortOrder,
    ),
    siteOrderIdx: index("creator_site_sections_site_order_idx").on(
      table.siteId,
      table.sortOrder,
    ),
  }),
);

export const creatorSiteRedirects = pgTable(
  "creator_site_redirects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .references(() => creatorSites.id, { onDelete: "cascade" })
      .notNull(),
    sourcePath: text("source_path").notNull(),
    targetUrl: text("target_url").notNull(),
    statusCode: integer("status_code").notNull().default(302),
    hits: integer("hits").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    siteSourceUnique: unique("creator_site_redirects_site_source_unique").on(
      table.siteId,
      table.sourcePath,
    ),
  }),
);

export const creatorSiteDomains = pgTable(
  "creator_site_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .references(() => creatorSites.id, { onDelete: "cascade" })
      .notNull(),
    domain: text("domain").notNull().unique(),
    verificationTokenHash: text("verification_token_hash").notNull(),
    verificationTokenHint: text("verification_token_hint").notNull(),
    status: text("status").notNull().default("pending"),
    verifiedAt: timestamp("verified_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    siteStatusIdx: index("creator_site_domains_site_status_idx").on(
      table.siteId,
      table.status,
    ),
  }),
);

export const sponsorshipMediaKits = pgTable(
  "sponsorship_media_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    headline: text("headline").notNull(),
    bio: text("bio").notNull().default(""),
    audienceProof: json("audience_proof")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    caseStudies: json("case_studies")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    assetIds: json("asset_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique(
      "sponsorship_media_kits_business_name_unique",
    ).on(table.businessId, table.name),
  }),
);
export const sponsorshipRateCards = pgTable(
  "sponsorship_rate_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("usd"),
    items: json("items")
      .$type<
        Array<{
          id: string;
          name: string;
          description: string;
          priceCents: number;
          unit: string;
        }>
      >()
      .notNull()
      .default([]),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique(
      "sponsorship_rate_cards_business_name_unique",
    ).on(table.businessId, table.name),
  }),
);
export const sponsorDeals = pgTable(
  "sponsor_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    brandName: text("brand_name").notNull(),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    stage: text("stage").notNull().default("lead"),
    currency: text("currency").notNull().default("usd"),
    proposedValueCents: integer("proposed_value_cents").notNull().default(0),
    contractedValueCents: integer("contracted_value_cents")
      .notNull()
      .default(0),
    disclosure: text("disclosure").notNull().default("#ad"),
    usageRights: json("usage_rights")
      .$type<import("./sponsorship").SponsorshipUsageRights>()
      .notNull(),
    renewalAt: timestamp("renewal_at"),
    wonAt: timestamp("won_at"),
    lostAt: timestamp("lost_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessStageIdx: index("sponsor_deals_business_stage_idx").on(
      table.businessId,
      table.stage,
      table.updatedAt,
    ),
  }),
);
export const sponsorshipProposals = pgTable(
  "sponsorship_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .references(() => sponsorDeals.id, { onDelete: "cascade" })
      .notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    version: integer("version").notNull(),
    summary: text("summary").notNull(),
    valueCents: integer("value_cents").notNull(),
    validUntil: timestamp("valid_until").notNull(),
    deliverables: json("deliverables")
      .$type<Array<import("./sponsorship").SponsorshipDeliverable>>()
      .notNull(),
    paymentTerms: text("payment_terms").notNull(),
    cancellationTerms: text("cancellation_terms").notNull().default(""),
    usageRights: json("usage_rights")
      .$type<import("./sponsorship").SponsorshipUsageRights>()
      .notNull(),
    status: text("status").notNull().default("draft"),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    dealVersionUnique: unique("sponsorship_proposals_deal_version_unique").on(
      table.dealId,
      table.version,
    ),
  }),
);
export const sponsorshipContracts = pgTable("sponsorship_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .references(() => sponsorDeals.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  proposalId: uuid("proposal_id")
    .references(() => sponsorshipProposals.id, { onDelete: "restrict" })
    .notNull(),
  documentId: integer("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("draft"),
  creatorSignedName: text("creator_signed_name"),
  brandSignedName: text("brand_signed_name"),
  creatorSignedAt: timestamp("creator_signed_at"),
  brandSignedAt: timestamp("brand_signed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const sponsorshipMilestones = pgTable("sponsorship_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .references(() => sponsorDeals.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  dueAt: timestamp("due_at"),
  amountCents: integer("amount_cents").notNull().default(0),
  status: text("status").notNull().default("pending"),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const sponsorshipInvoices = pgTable("sponsorship_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .references(() => sponsorDeals.id, { onDelete: "restrict" })
    .notNull(),
  milestoneId: uuid("milestone_id").references(() => sponsorshipMilestones.id, {
    onDelete: "set null",
  }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  dueAt: timestamp("due_at").notNull(),
  status: text("status").notNull().default("draft"),
  providerInvoiceReference: text("provider_invoice_reference"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const sponsorshipPerformanceSnapshots = pgTable(
  "sponsorship_performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .references(() => sponsorDeals.id, { onDelete: "cascade" })
      .notNull(),
    distributionJobId: uuid("distribution_job_id").references(
      () => distributionJobs.id,
      { onDelete: "set null" },
    ),
    source: text("source").notNull().default("manual"),
    metrics: json("metrics")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    capturedByUserId: integer("captured_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
  },
  (table) => ({
    dealCapturedIdx: index("sponsorship_performance_deal_captured_idx").on(
      table.dealId,
      table.capturedAt,
    ),
  }),
);
export const sponsorshipPortalTokens = pgTable("sponsorship_portal_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .references(() => sponsorDeals.id, { onDelete: "cascade" })
    .notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  stakeholderName: text("stakeholder_name").notNull(),
  stakeholderEmail: text("stakeholder_email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const affiliatePrograms = pgTable(
  "affiliate_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull().default(""),
    applicationMode: text("application_mode").notNull().default("review"),
    attributionModel: text("attribution_model").notNull().default("last_click"),
    attributionWindowDays: integer("attribution_window_days")
      .notNull()
      .default(30),
    cookieConsentRequired: boolean("cookie_consent_required")
      .notNull()
      .default(true),
    productIds: json("product_ids").$type<number[]>().notNull().default([]),
    commissionRule: json("commission_rule")
      .$type<import("./affiliate").AffiliateCommissionRule>()
      .notNull(),
    holdDays: integer("hold_days").notNull().default(30),
    minimumPayoutCents: integer("minimum_payout_cents").notNull().default(5000),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    businessNameUnique: unique("affiliate_programs_business_name_unique").on(
      table.businessId,
      table.name,
    ),
    businessStatusIdx: index("affiliate_programs_business_status_idx").on(
      table.businessId,
      table.status,
    ),
  }),
);
export const affiliateApplications = pgTable(
  "affiliate_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .references(() => affiliatePrograms.id, { onDelete: "cascade" })
      .notNull(),
    applicantUserId: integer("applicant_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    partnerType: text("partner_type").notNull().default("affiliate"),
    audienceSummary: text("audience_summary").notNull().default(""),
    promotionPlan: text("promotion_plan").notNull().default(""),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    reviewNote: text("review_note").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    programEmailUnique: unique(
      "affiliate_applications_program_email_unique",
    ).on(table.programId, table.email),
  }),
);
export const affiliatePartners = pgTable(
  "affiliate_partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .references(() => affiliatePrograms.id, { onDelete: "cascade" })
      .notNull(),
    applicationId: uuid("application_id").references(
      () => affiliateApplications.id,
      { onDelete: "set null" },
    ),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    partnerType: text("partner_type").notNull().default("affiliate"),
    code: text("code").notNull().unique(),
    status: text("status").notNull().default("active"),
    payoutState: text("payout_state").notNull().default("not_connected"),
    fraudState: text("fraud_state").notNull().default("clear"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    programEmailUnique: unique("affiliate_partners_program_email_unique").on(
      table.programId,
      table.email,
    ),
    programStatusIdx: index("affiliate_partners_program_status_idx").on(
      table.programId,
      table.status,
    ),
  }),
);
export const affiliateLinks = pgTable("affiliate_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id")
    .references(() => affiliatePartners.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  destinationUrl: text("destination_url").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  clickCount: integer("click_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .references(() => affiliatePrograms.id, { onDelete: "cascade" })
      .notNull(),
    partnerId: uuid("partner_id")
      .references(() => affiliatePartners.id, { onDelete: "cascade" })
      .notNull(),
    linkId: uuid("link_id").references(() => affiliateLinks.id, {
      onDelete: "set null",
    }),
    clickToken: text("click_token").notNull().unique(),
    anonymousId: text("anonymous_id"),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ipHash: text("ip_hash").notNull(),
    userAgentHash: text("user_agent_hash").notNull(),
    destinationUrl: text("destination_url").notNull(),
    consentState: text("consent_state").notNull().default("essential_only"),
    riskScore: integer("risk_score").notNull().default(0),
    riskReasons: json("risk_reasons").$type<string[]>().notNull().default([]),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    partnerOccurredIdx: index("affiliate_clicks_partner_occurred_idx").on(
      table.partnerId,
      table.occurredAt,
    ),
    ipOccurredIdx: index("affiliate_clicks_ip_occurred_idx").on(
      table.ipHash,
      table.occurredAt,
    ),
  }),
);
export const affiliateConversions = pgTable(
  "affiliate_conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .references(() => affiliatePrograms.id, { onDelete: "restrict" })
      .notNull(),
    partnerId: uuid("partner_id")
      .references(() => affiliatePartners.id, { onDelete: "restrict" })
      .notNull(),
    clickId: uuid("click_id").references(() => affiliateClicks.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    buyerUserId: integer("buyer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceReference: text("source_reference").notNull(),
    cycleIndex: integer("cycle_index").notNull().default(0),
    grossRevenueCents: integer("gross_revenue_cents").notNull(),
    qualifiedRevenueCents: integer("qualified_revenue_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("pending"),
    riskScore: integer("risk_score").notNull().default(0),
    riskReasons: json("risk_reasons").$type<string[]>().notNull().default([]),
    holdUntil: timestamp("hold_until").notNull(),
    approvedAt: timestamp("approved_at"),
    reversedCents: integer("reversed_cents").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceUnique: unique("affiliate_conversions_source_unique").on(
      table.programId,
      table.sourceReference,
      table.cycleIndex,
    ),
    partnerStatusIdx: index("affiliate_conversions_partner_status_idx").on(
      table.partnerId,
      table.status,
      table.createdAt,
    ),
  }),
);
export const affiliateLedgerEntries = pgTable(
  "affiliate_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .references(() => affiliatePrograms.id, { onDelete: "restrict" })
      .notNull(),
    partnerId: uuid("partner_id")
      .references(() => affiliatePartners.id, { onDelete: "restrict" })
      .notNull(),
    conversionId: uuid("conversion_id").references(
      () => affiliateConversions.id,
      { onDelete: "set null" },
    ),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    sourceReference: text("source_reference").notNull().unique(),
    status: text("status").notNull().default("pending"),
    availableAt: timestamp("available_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    partnerStatusIdx: index("affiliate_ledger_partner_status_idx").on(
      table.partnerId,
      table.status,
      table.createdAt,
    ),
  }),
);
export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id")
    .references(() => affiliatePrograms.id, { onDelete: "restrict" })
    .notNull(),
  partnerId: uuid("partner_id")
    .references(() => affiliatePartners.id, { onDelete: "restrict" })
    .notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("provider_pending"),
  providerReference: text("provider_reference"),
  failureCode: text("failure_code"),
  ledgerEntryIds: json("ledger_entry_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const affiliateFraudSignals = pgTable("affiliate_fraud_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id")
    .references(() => affiliatePrograms.id, { onDelete: "cascade" })
    .notNull(),
  partnerId: uuid("partner_id").references(() => affiliatePartners.id, {
    onDelete: "set null",
  }),
  clickId: uuid("click_id").references(() => affiliateClicks.id, {
    onDelete: "set null",
  }),
  conversionId: uuid("conversion_id").references(
    () => affiliateConversions.id,
    { onDelete: "set null" },
  ),
  signal: text("signal").notNull(),
  severity: text("severity").notNull(),
  evidence: json("evidence")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  status: text("status").notNull().default("open"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const bookingCalendars = pgTable(
  "booking_calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    businessNameUnique: unique("booking_calendars_business_name_unique").on(
      t.businessId,
      t.name,
    ),
  }),
);
export const bookingAvailabilityRules = pgTable("booking_availability_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  calendarId: uuid("calendar_id")
    .references(() => bookingCalendars.id, { onDelete: "cascade" })
    .notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const bookingBlackouts = pgTable("booking_blackouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  calendarId: uuid("calendar_id")
    .references(() => bookingCalendars.id, { onDelete: "cascade" })
    .notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const appointmentTypes = pgTable("appointment_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  ownerUserId: integer("owner_user_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  calendarId: uuid("calendar_id")
    .references(() => bookingCalendars.id, { onDelete: "restrict" })
    .notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull(),
  bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
  bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
  capacity: integer("capacity").notNull().default(1),
  locationMode: text("location_mode").notNull(),
  location: text("location"),
  priceCents: integer("price_cents").notNull().default(0),
  currency: text("currency").notNull().default("usd"),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  minimumNoticeMinutes: integer("minimum_notice_minutes").notNull().default(60),
  bookingHorizonDays: integer("booking_horizon_days").notNull().default(90),
  cancellationNoticeMinutes: integer("cancellation_notice_minutes")
    .notNull()
    .default(1440),
  reminderMinutes: json("reminder_minutes")
    .$type<number[]>()
    .notNull()
    .default([1440, 60]),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const bookingReservations = pgTable(
  "booking_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentTypeId: uuid("appointment_type_id")
      .references(() => appointmentTypes.id, { onDelete: "restrict" })
      .notNull(),
    bookerUserId: integer("booker_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestTimezone: text("guest_timezone").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: text("status").notNull().default("confirmed"),
    paymentStatus: text("payment_status").notNull().default("not_required"),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    roomId: uuid("room_id").references(() => communityRooms.id, {
      onDelete: "set null",
    }),
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    typeStartIdx: index("booking_reservations_type_start_idx").on(
      t.appointmentTypeId,
      t.startsAt,
      t.status,
    ),
  }),
);
export const bookingWaitlist = pgTable("booking_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentTypeId: uuid("appointment_type_id")
    .references(() => appointmentTypes.id, { onDelete: "cascade" })
    .notNull(),
  bookerUserId: integer("booker_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestTimezone: text("guest_timezone").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  status: text("status").notNull().default("waiting"),
  position: integer("position").notNull(),
  promotedReservationId: uuid("promoted_reservation_id").references(
    () => bookingReservations.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  promotedAt: timestamp("promoted_at"),
});
export const eventSeries = pgTable("event_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .references(() => events.id, { onDelete: "cascade" })
    .notNull(),
  timezone: text("timezone").notNull(),
  frequency: text("frequency").notNull(),
  intervalCount: integer("interval_count").notNull().default(1),
  occurrenceCount: integer("occurrence_count").notNull(),
  createdByUserId: integer("created_by_user_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const eventOccurrences = pgTable(
  "event_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id")
      .references(() => eventSeries.id, { onDelete: "cascade" })
      .notNull(),
    eventId: uuid("event_id")
      .references(() => events.id, { onDelete: "cascade" })
      .notNull(),
    sequence: integer("sequence").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    seriesSequenceUnique: unique("event_occurrences_series_sequence_unique").on(
      t.seriesId,
      t.sequence,
    ),
  }),
);
export const eventCommercialSettings = pgTable("event_commercial_settings", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  timezone: text("timezone").notNull(),
  capacity: integer("capacity").notNull(),
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(true),
  cancellationNoticeMinutes: integer("cancellation_notice_minutes")
    .notNull()
    .default(1440),
  refundPolicy: text("refund_policy")
    .notNull()
    .default("refund_before_deadline"),
  roomId: uuid("room_id").references(() => communityRooms.id, {
    onDelete: "set null",
  }),
  replayAssetId: uuid("replay_asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const eventTicketTypes = pgTable("event_ticket_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .references(() => events.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  capacity: integer("capacity").notNull(),
  salesStartAt: timestamp("sales_start_at"),
  salesEndAt: timestamp("sales_end_at"),
  maxPerBuyer: integer("max_per_buyer").notNull().default(10),
  replayAccessDays: integer("replay_access_days").notNull().default(30),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const eventTickets = pgTable(
  "event_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .references(() => events.id, { onDelete: "restrict" })
      .notNull(),
    ticketTypeId: uuid("ticket_type_id")
      .references(() => eventTicketTypes.id, { onDelete: "restrict" })
      .notNull(),
    holderUserId: integer("holder_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    holderName: text("holder_name").notNull(),
    holderEmail: text("holder_email").notNull(),
    quantity: integer("quantity").notNull().default(1),
    status: text("status").notNull().default("confirmed"),
    paymentStatus: text("payment_status").notNull().default("not_required"),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    ticketCode: text("ticket_code").notNull().unique(),
    checkedInAt: timestamp("checked_in_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    eventStatusIdx: index("event_tickets_event_status_idx").on(
      t.eventId,
      t.status,
    ),
  }),
);
export const eventWaitlist = pgTable("event_waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .references(() => events.id, { onDelete: "cascade" })
    .notNull(),
  ticketTypeId: uuid("ticket_type_id")
    .references(() => eventTicketTypes.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  quantity: integer("quantity").notNull().default(1),
  position: integer("position").notNull(),
  status: text("status").notNull().default("waiting"),
  promotedTicketId: uuid("promoted_ticket_id").references(
    () => eventTickets.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  promotedAt: timestamp("promoted_at"),
});
export const eventAttendance = pgTable("event_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .references(() => events.id, { onDelete: "cascade" })
    .notNull(),
  ticketId: uuid("ticket_id").references(() => eventTickets.id, {
    onDelete: "set null",
  }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const eventReplayEntitlements = pgTable(
  "event_replay_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .references(() => events.id, { onDelete: "cascade" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "restrict" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    ticketId: uuid("ticket_id").references(() => eventTickets.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userUnique: unique("event_replay_user_unique").on(
      t.eventId,
      t.assetId,
      t.userId,
    ),
  }),
);
export const eventAutomationJobs = pgTable(
  "event_automation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    reservationId: uuid("reservation_id").references(
      () => bookingReservations.id,
      { onDelete: "cascade" },
    ),
    ticketId: uuid("ticket_id").references(() => eventTickets.id, {
      onDelete: "cascade",
    }),
    jobType: text("job_type").notNull(),
    recipientUserId: integer("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recipientEmail: text("recipient_email").notNull(),
    dueAt: timestamp("due_at").notNull(),
    status: text("status").notNull().default("queued"),
    payload: json("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (t) => ({ dueIdx: index("event_automation_due_idx").on(t.status, t.dueAt) }),
);

export const marketplaceSellerProfiles = pgTable(
  "marketplace_seller_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    displayName: text("display_name").notNull(),
    slug: text("slug").notNull().unique(),
    headline: text("headline").notNull().default(""),
    bio: text("bio").notNull().default(""),
    supportEmail: text("support_email").notNull(),
    brandColor: text("brand_color").notNull().default("#1d9bf0"),
    logoUrl: text("logo_url"),
    refundPolicy: text("refund_policy").notNull(),
    fulfillmentSlaHours: integer("fulfillment_sla_hours").notNull().default(24),
    country: text("country"),
    taxResponsibility: text("tax_responsibility")
      .notNull()
      .default("platform_provider_pending"),
    operationalPolicyVersion: text("operational_policy_version").notNull(),
    operationalPolicyAcceptedAt: timestamp(
      "operational_policy_accepted_at",
    ).notNull(),
    onboardingStatus: text("onboarding_status").notNull().default("active"),
    riskStatus: text("risk_status").notNull().default("clear"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);
export const marketplacePolicyAcceptances = pgTable(
  "marketplace_policy_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerProfileId: uuid("seller_profile_id")
      .references(() => marketplaceSellerProfiles.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    policyType: text("policy_type").notNull(),
    policyVersion: text("policy_version").notNull(),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (t) => ({
    acceptanceUnique: unique("marketplace_policy_acceptance_unique").on(
      t.sellerProfileId,
      t.policyType,
      t.policyVersion,
    ),
  }),
);
export const marketplacePromotions = pgTable(
  "marketplace_promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerProfileId: uuid("seller_profile_id")
      .references(() => marketplaceSellerProfiles.id, { onDelete: "cascade" })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    discountType: text("discount_type").notNull(),
    percentageBps: integer("percentage_bps").notNull().default(0),
    fixedAmountCents: integer("fixed_amount_cents").notNull().default(0),
    trialDays: integer("trial_days").notNull().default(0),
    productIds: json("product_ids").$type<number[]>().notNull().default([]),
    minimumSubtotalCents: integer("minimum_subtotal_cents")
      .notNull()
      .default(0),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    maximumRedemptions: integer("maximum_redemptions").notNull().default(0),
    maximumPerBuyer: integer("maximum_per_buyer").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    businessCodeUnique: unique("marketplace_promotion_business_code_unique").on(
      t.businessId,
      t.code,
    ),
  }),
);
export const marketplacePromotionRedemptions = pgTable(
  "marketplace_promotion_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .references(() => marketplacePromotions.id, { onDelete: "restrict" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    buyerUserId: integer("buyer_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    discountAmountCents: integer("discount_amount_cents").notNull(),
    status: text("status").notNull().default("reserved"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    redeemedAt: timestamp("redeemed_at"),
    reversedAt: timestamp("reversed_at"),
  },
  (t) => ({
    limitIdx: index("marketplace_promotion_redemptions_limit_idx").on(
      t.promotionId,
      t.buyerUserId,
      t.status,
    ),
  }),
);
export const marketplaceBundles = pgTable("marketplace_bundles", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerProfileId: uuid("seller_profile_id")
    .references(() => marketplaceSellerProfiles.id, { onDelete: "cascade" })
    .notNull(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  productId: integer("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const marketplaceBundleItems = pgTable(
  "marketplace_bundle_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleId: uuid("bundle_id")
      .references(() => marketplaceBundles.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "restrict" })
      .notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    bundleProductUnique: unique("marketplace_bundle_item_unique").on(
      t.bundleId,
      t.productId,
    ),
  }),
);
export const marketplaceSupportCases = pgTable(
  "marketplace_support_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseNumber: text("case_number").notNull().unique(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "restrict" })
      .notNull(),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    buyerUserId: integer("buyer_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    sellerUserId: integer("seller_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull().default("normal"),
    summary: text("summary").notNull(),
    requestedRefundCents: integer("requested_refund_cents")
      .notNull()
      .default(0),
    approvedRefundCents: integer("approved_refund_cents").notNull().default(0),
    status: text("status").notNull().default("open"),
    providerActionStatus: text("provider_action_status")
      .notNull()
      .default("not_required"),
    resolutionNote: text("resolution_note").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    partyStatusIdx: index("marketplace_support_party_status_idx").on(
      t.sellerUserId,
      t.buyerUserId,
      t.status,
    ),
  }),
);
export const marketplaceSupportMessages = pgTable(
  "marketplace_support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .references(() => marketplaceSupportCases.id, { onDelete: "cascade" })
      .notNull(),
    authorUserId: integer("author_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").notNull().default("participants"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const userBlocks = pgTable(
  "user_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerUserId: integer("blocker_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    blockedUserId: integer("blocked_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pairUnique: unique("user_blocks_pair_unique").on(
      table.blockerUserId,
      table.blockedUserId,
    ),
  }),
);

export const userSafetyControls = pgTable(
  "user_safety_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: integer("actor_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    targetUserId: integer("target_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    muted: boolean("muted").notNull().default(false),
    restricted: boolean("restricted").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    pairUnique: unique("user_safety_controls_pair_unique").on(
      table.actorUserId,
      table.targetUserId,
    ),
  }),
);

export const competitiveBenchmarkDefinitions = pgTable(
  "competitive_benchmark_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    family: text("family").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    targetUser: text("target_user").notNull(),
    workflow: text("workflow").notNull(),
    comparisonProducts: json("comparison_products")
      .$type<string[]>()
      .notNull()
      .default([]),
    outputSpecification: json("output_specification")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    rubric: json("rubric")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    parityRequirements: json("parity_requirements")
      .$type<Array<{
        id: string;
        comparisonProduct: string;
        capability: string;
        acceptanceCriterion: string;
        tier: "required_parity" | "specialist_edge" | "connected_advantage";
      }>>()
      .notNull()
      .default([]),
    sourceReferences: json("source_references")
      .$type<Array<{ label: string; url: string; checkedAt: string }>>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("draft"),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    lockedByUserId: integer("locked_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    lockedAt: timestamp("locked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    versionUnique: unique("competitive_benchmark_definition_version_unique").on(
      table.businessId,
      table.family,
      table.version,
    ),
  }),
);

export const competitiveBenchmarkRuns = pgTable(
  "competitive_benchmark_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .references(() => competitiveBenchmarkDefinitions.id, {
        onDelete: "restrict",
      })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    operatorUserId: integer("operator_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    implementation: text("implementation").notNull(),
    comparisonProduct: text("comparison_product"),
    status: text("status").notNull().default("in_progress"),
    environment: json("environment")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    activeTimeMs: integer("active_time_ms"),
    elapsedTimeMs: integer("elapsed_time_ms"),
    applicationCount: integer("application_count"),
    exportCount: integer("export_count"),
    uploadCount: integer("upload_count"),
    manualHandoffCount: integer("manual_handoff_count"),
    actionCount: integer("action_count"),
    retryCount: integer("retry_count"),
    failureCount: integer("failure_count"),
    unrecoverableErrorCount: integer("unrecoverable_error_count"),
    outputQualityScore: doublePrecision("output_quality_score"),
    safetyScore: doublePrecision("safety_score"),
    reliabilityScore: doublePrecision("reliability_score"),
    accessibilityScore: doublePrecision("accessibility_score"),
    notes: text("notes").notNull().default(""),
    evidence: json("evidence")
      .$type<Array<{ kind: string; uri: string; checksum?: string }>>()
      .notNull()
      .default([]),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    definitionStatusIndex: index("competitive_benchmark_run_status_idx").on(
      table.definitionId,
      table.status,
    ),
  }),
);

export const competitiveBenchmarkAssessments = pgTable(
  "competitive_benchmark_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    definitionId: uuid("definition_id")
      .references(() => competitiveBenchmarkDefinitions.id, {
        onDelete: "restrict",
      })
      .notNull(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    creativesOsRunId: uuid("creativesos_run_id")
      .references(() => competitiveBenchmarkRuns.id, { onDelete: "restrict" })
      .notNull(),
    comparisonRunId: uuid("comparison_run_id")
      .references(() => competitiveBenchmarkRuns.id, { onDelete: "restrict" })
      .notNull(),
    state: text("state").notNull(),
    qualityComparable: boolean("quality_comparable").notNull(),
    activeTimeReductionBps: integer("active_time_reduction_bps").notNull(),
    handoffReductionBps: integer("handoff_reduction_bps").notNull(),
    reviewerUserId: integer("reviewer_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    reviewerNote: text("reviewer_note").notNull(),
    requirementResults: json("requirement_results")
      .$type<Array<{
        requirementId: string;
        status: "passed" | "failed";
        evidenceKinds: string[];
        note: string;
      }>>()
      .notNull()
      .default([]),
    requiredCapabilityCount: integer("required_capability_count")
      .notNull()
      .default(0),
    passedCapabilityCount: integer("passed_capability_count")
      .notNull()
      .default(0),
    failedCapabilityCount: integer("failed_capability_count")
      .notNull()
      .default(0),
    assessedAt: timestamp("assessed_at").defaultNow().notNull(),
  },
  (table) => ({
    runPairUnique: unique("competitive_benchmark_assessment_pair_unique").on(
      table.creativesOsRunId,
      table.comparisonRunId,
    ),
  }),
);

export const competitiveBenchmarkRemediations = pgTable(
  "competitive_benchmark_remediations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    definitionId: uuid("definition_id")
      .references(() => competitiveBenchmarkDefinitions.id, {
        onDelete: "restrict",
      })
      .notNull(),
    comparisonProduct: text("comparison_product").notNull(),
    requirementId: text("requirement_id").notNull(),
    capability: text("capability").notNull(),
    acceptanceCriterion: text("acceptance_criterion").notNull(),
    status: text("status").notNull().default("open"),
    priority: integer("priority").notNull().default(100),
    assigneeUserId: integer("assignee_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at"),
    operatorNote: text("operator_note").notNull().default(""),
    lastFailureNote: text("last_failure_note").notNull(),
    failureCount: integer("failure_count").notNull().default(1),
    workItemId: uuid("work_item_id").references(() => creativeWorkItems.id, {
      onDelete: "set null",
    }),
    lastFailedAssessmentId: uuid("last_failed_assessment_id")
      .references(() => competitiveBenchmarkAssessments.id, {
        onDelete: "restrict",
      })
      .notNull(),
    resolvedByAssessmentId: uuid("resolved_by_assessment_id").references(
      () => competitiveBenchmarkAssessments.id,
      { onDelete: "restrict" },
    ),
    openedByUserId: integer("opened_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    requirementUnique: unique(
      "competitive_benchmark_remediations_requirement_unique",
    ).on(
      table.businessId,
      table.definitionId,
      table.comparisonProduct,
      table.requirementId,
    ),
    businessStatusIdx: index(
      "competitive_benchmark_remediations_business_status_idx",
    ).on(table.businessId, table.status, table.priority),
  }),
);

export const contentModerationStates = pgTable(
  "content_moderation_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    visibility: text("visibility").notNull().default("visible"),
    sensitive: boolean("sensitive").notNull().default(false),
    reason: text("reason"),
    decidedByUserId: integer("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    targetUnique: unique("content_moderation_states_target_unique").on(
      table.targetType,
      table.targetId,
    ),
  }),
);

export const discoveryPreferences = pgTable("discovery_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  interests: json("interests").$type<string[]>().notNull().default([]),
  hiddenCreatorIds: json("hidden_creator_ids")
    .$type<number[]>()
    .notNull()
    .default([]),
  sensitiveContent: text("sensitive_content").notNull().default("reduce"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const discoveryPolicies = pgTable(
  "discovery_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    weights: json("weights").$type<Record<string, number>>().notNull(),
    guardrails: json("guardrails").$type<Record<string, unknown>>().notNull(),
    createdByUserId: integer("created_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    activatedAt: timestamp("activated_at"),
  },
  (table) => ({
    keyVersionUnique: unique("discovery_policies_key_version_unique").on(
      table.key,
      table.version,
    ),
    activeKeyUnique: uniqueIndex("discovery_policies_active_key_unique")
      .on(table.key)
      .where(sql`${table.status} = 'active'`),
  }),
);

export const discoveryExposures = pgTable(
  "discovery_exposures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    mode: text("mode").notNull(),
    policyVersion: integer("policy_version").notNull(),
    rank: integer("rank").notNull(),
    score: doublePrecision("score").notNull(),
    explanation: json("explanation").$type<string[]>().notNull().default([]),
    requestId: text("request_id").notNull(),
    exposedAt: timestamp("exposed_at").defaultNow().notNull(),
  },
  (table) => ({
    requestPostUnique: unique("discovery_exposures_request_post_unique").on(
      table.requestId,
      table.postId,
    ),
    userExposedIdx: index("discovery_exposures_user_idx").on(
      table.userId,
      table.exposedAt,
    ),
  }),
);

export const searchDocuments = pgTable(
  "search_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    ownerUserId: integer("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    visibility: text("visibility").notNull().default("public"),
    status: text("status").notNull().default("active"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    entityUnique: unique("search_documents_entity_unique").on(
      table.entityType,
      table.entityId,
    ),
    statusIdx: index("search_documents_status_idx").on(
      table.visibility,
      table.status,
      table.entityType,
    ),
  }),
);

export const assetProvenanceClaims = pgTable(
  "asset_provenance_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "cascade" })
      .notNull(),
    assertedByUserId: integer("asserted_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    kind: text("kind").notNull(),
    provider: text("provider"),
    model: text("model"),
    tool: text("tool"),
    disclosure: text("disclosure").notNull().default(""),
    sourceAssetIds: json("source_asset_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    metadata: json("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    inheritedFromClaimId: uuid("inherited_from_claim_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    assetCreatedIdx: index("asset_provenance_claims_asset_idx").on(
      table.assetId,
      table.createdAt,
    ),
  }),
);

export const rightsCases = pgTable(
  "rights_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    caseType: text("case_type").notNull(),
    parentCaseId: uuid("parent_case_id"),
    submittedByUserId: integer("submitted_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    claimantName: text("claimant_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    statement: text("statement").notNull(),
    jurisdiction: text("jurisdiction"),
    evidence: json("evidence")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("submitted"),
    assignedReviewerUserId: integer("assigned_reviewer_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    decision: text("decision"),
    dueAt: timestamp("due_at"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    targetStatusIdx: index("rights_cases_target_idx").on(
      table.targetType,
      table.targetId,
      table.status,
    ),
    parentIdx: index("rights_cases_parent_idx").on(table.parentCaseId),
  }),
);

export const rightsCaseEvents = pgTable(
  "rights_case_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .references(() => rightsCases.id, { onDelete: "cascade" })
      .notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    note: text("note").notNull().default(""),
    evidence: json("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseCreatedIdx: index("rights_case_events_case_idx").on(
      table.caseId,
      table.createdAt,
    ),
  }),
);

export const repeatInfringerStrikes = pgTable(
  "repeat_infringer_strikes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    caseId: uuid("case_id")
      .references(() => rightsCases.id, { onDelete: "restrict" })
      .notNull(),
    status: text("status").notNull().default("active"),
    reason: text("reason").notNull(),
    issuedByUserId: integer("issued_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    issuedAt: timestamp("issued_at").defaultNow().notNull(),
    reversedAt: timestamp("reversed_at"),
  },
  (table) => ({
    caseUserUnique: unique("repeat_infringer_strikes_case_user_unique").on(
      table.caseId,
      table.userId,
    ),
    userStatusIdx: index("repeat_infringer_strikes_user_idx").on(
      table.userId,
      table.status,
    ),
  }),
);

// Legacy in-app notification projection retained for current clients.
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
  // Sender-scoped identity for retry-safe offline delivery.
  clientMutationId: text("client_mutation_id"),
  reactions: json("reactions").default({}).notNull(), // Stores user reactions: { userId: reactionType }
});

// Read position is participant-scoped. The legacy direct_messages.read flag
// cannot represent group-chat state because one participant reading a message
// must not clear it for everyone else.
export const conversationReadStates = pgTable(
  "conversation_read_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: integer("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    lastReadMessageId: integer("last_read_message_id").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    participantUnique: unique("conversation_read_states_participant_unique").on(
      table.conversationId,
      table.userId,
    ),
    userUpdatedIdx: index("conversation_read_states_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
  }),
);

export const insertDirectMessageSchema = createInsertSchema(
  directMessages,
).pick({
  conversationId: true,
  senderId: true,
  content: true,
  read: true,
  isEdited: true,
  replyToMessageId: true,
  clientMutationId: true,
  reactions: true,
});

// UGC is a native two-sided marketplace and production workflow. Provider
// connections may later import ad performance, but discovery, contracting,
// private review, approvals, and creator earnings remain usable on their own.
export const ugcCreatorProfiles = pgTable(
  "ugc_creator_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    headline: text("headline").notNull().default(""),
    bio: text("bio").notNull().default(""),
    niches: json("niches").$type<string[]>().notNull().default([]),
    languages: json("languages").$type<string[]>().notNull().default([]),
    startingRateCents: integer("starting_rate_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    availability: text("availability").notNull().default("available"),
    portfolioPublic: boolean("portfolio_public").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    availabilityIdx: index("ugc_creator_profiles_availability_idx").on(
      table.availability,
      table.updatedAt,
    ),
  }),
);

export const ugcPortfolioItems = pgTable(
  "ugc_portfolio_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorUserId: integer("creator_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "restrict" })
      .notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    format: text("format").notNull(),
    public: boolean("public").notNull().default(true),
    performance: json("performance")
      .$type<{
        impressions: number;
        conversions: number;
        attributedRevenueCents: number;
      }>()
      .notNull()
      .default({ impressions: 0, conversions: 0, attributedRevenueCents: 0 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    creatorUpdatedIdx: index("ugc_portfolio_items_creator_updated_idx").on(
      table.creatorUserId,
      table.updatedAt,
    ),
  }),
);

export const ugcOpportunities = pgTable(
  "ugc_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "cascade" })
      .notNull(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    platforms: json("platforms").$type<string[]>().notNull().default([]),
    deliverables: json("deliverables")
      .$type<
        Array<{
          title: string;
          quantity: number;
          format: string;
          durationSeconds?: number;
          notes: string;
        }>
      >()
      .notNull()
      .default([]),
    compensationModel: text("compensation_model").notNull(),
    fixedFeeCents: integer("fixed_fee_cents").notNull().default(0),
    commissionBps: integer("commission_bps").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    applicationDeadline: timestamp("application_deadline"),
    contentDueAt: timestamp("content_due_at"),
    usageRights: json("usage_rights")
      .$type<import("./ugc").UgcUsageRights>()
      .notNull(),
    eligibility: json("eligibility")
      .$type<import("./ugc").UgcEligibility>()
      .notNull(),
    revisionLimit: integer("revision_limit").notNull().default(2),
    disclosure: text("disclosure").notNull().default(""),
    sampleTerms: json("sample_terms")
      .$type<import("./ugc").UgcSampleTerms>()
      .notNull()
      .default({
        required: false,
        items: [],
        brandPaysShipping: true,
        returnRequired: false,
        returnWindowDays: 0,
        notes: "",
      }),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusPublishedIdx: index("ugc_opportunities_status_published_idx").on(
      table.status,
      table.publishedAt,
    ),
    businessUpdatedIdx: index("ugc_opportunities_business_updated_idx").on(
      table.businessId,
      table.updatedAt,
    ),
  }),
);

export const ugcApplications = pgTable(
  "ugc_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .references(() => ugcOpportunities.id, { onDelete: "cascade" })
      .notNull(),
    creatorUserId: integer("creator_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    pitch: text("pitch").notNull(),
    portfolioItemIds: json("portfolio_item_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    previewAssetId: uuid("preview_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    proposedFeeCents: integer("proposed_fee_cents"),
    status: text("status").notNull().default("submitted"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    opportunityCreatorUnique: unique(
      "ugc_applications_opportunity_creator_unique",
    ).on(table.opportunityId, table.creatorUserId),
    opportunityStatusIdx: index("ugc_applications_opportunity_status_idx").on(
      table.opportunityId,
      table.status,
    ),
    creatorUpdatedIdx: index("ugc_applications_creator_updated_idx").on(
      table.creatorUserId,
      table.updatedAt,
    ),
  }),
);

export const ugcCollaborations = pgTable(
  "ugc_collaborations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .references(() => ugcOpportunities.id, { onDelete: "restrict" })
      .notNull(),
    applicationId: uuid("application_id")
      .references(() => ugcApplications.id, { onDelete: "restrict" })
      .notNull()
      .unique(),
    businessId: uuid("business_id")
      .references(() => businesses.id, { onDelete: "restrict" })
      .notNull(),
    creatorUserId: integer("creator_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    conversationId: integer("conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("in_progress"),
    compensation: json("compensation")
      .$type<{
        model: string;
        fixedFeeCents: number;
        commissionBps: number;
        currency: string;
      }>()
      .notNull(),
    usageRights: json("usage_rights")
      .$type<Record<string, unknown>>()
      .notNull(),
    revisionLimit: integer("revision_limit").notNull().default(2),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
    approvedAt: timestamp("approved_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    creatorUpdatedIdx: index("ugc_collaborations_creator_updated_idx").on(
      table.creatorUserId,
      table.updatedAt,
    ),
    businessUpdatedIdx: index("ugc_collaborations_business_updated_idx").on(
      table.businessId,
      table.updatedAt,
    ),
  }),
);

export const ugcSubmissions = pgTable(
  "ugc_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collaborationId: uuid("collaboration_id")
      .references(() => ugcCollaborations.id, { onDelete: "cascade" })
      .notNull(),
    creatorUserId: integer("creator_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    assetId: uuid("asset_id")
      .references(() => assets.id, { onDelete: "restrict" })
      .notNull(),
    version: integer("version").notNull(),
    caption: text("caption").notNull().default(""),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("submitted"),
    feedback: text("feedback"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    collaborationVersionUnique: unique(
      "ugc_submissions_collaboration_version_unique",
    ).on(table.collaborationId, table.version),
    collaborationCreatedIdx: index(
      "ugc_submissions_collaboration_created_idx",
    ).on(table.collaborationId, table.createdAt),
  }),
);

export const ugcSampleShipments = pgTable(
  "ugc_sample_shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collaborationId: uuid("collaboration_id")
      .references(() => ugcCollaborations.id, { onDelete: "cascade" })
      .notNull(),
    requestedByUserId: integer("requested_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    recipientUserId: integer("recipient_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    direction: text("direction").notNull().default("brand_to_creator"),
    items: json("items")
      .$type<Array<{ title: string; sku: string; quantity: number }>>()
      .notNull()
      .default([]),
    recipientAddressCiphertext: text("recipient_address_ciphertext").notNull(),
    addressSummary: json("address_summary")
      .$type<{ city: string; region: string; country: string }>()
      .notNull(),
    status: text("status").notNull().default("requested"),
    carrier: text("carrier"),
    trackingNumberCiphertext: text("tracking_number_ciphertext"),
    statusHistory: json("status_history")
      .$type<
        Array<{
          status: string;
          actorUserId: number;
          at: string;
          note: string;
        }>
      >()
      .notNull()
      .default([]),
    shippedAt: timestamp("shipped_at"),
    deliveredAt: timestamp("delivered_at"),
    returnedAt: timestamp("returned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    collaborationCreatedIdx: index(
      "ugc_sample_shipments_collaboration_created_idx",
    ).on(table.collaborationId, table.createdAt),
    recipientStatusIdx: index("ugc_sample_shipments_recipient_status_idx").on(
      table.recipientUserId,
      table.status,
    ),
  }),
);

export const ugcPerformanceSnapshots = pgTable(
  "ugc_performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collaborationId: uuid("collaboration_id")
      .references(() => ugcCollaborations.id, { onDelete: "cascade" })
      .notNull(),
    capturedByUserId: integer("captured_by_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    source: text("source").notNull().default("manual"),
    impressions: integer("impressions").notNull().default(0),
    engagements: integer("engagements").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    conversions: integer("conversions").notNull().default(0),
    spendCents: integer("spend_cents").notNull().default(0),
    attributedRevenueCents: integer("attributed_revenue_cents")
      .notNull()
      .default(0),
    commissionAmountCents: integer("commission_amount_cents")
      .notNull()
      .default(0),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    collaborationCapturedIdx: index(
      "ugc_performance_collaboration_captured_idx",
    ).on(table.collaborationId, table.capturedAt),
  }),
);

export const ugcEarningsLedger = pgTable(
  "ugc_earnings_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collaborationId: uuid("collaboration_id")
      .references(() => ugcCollaborations.id, { onDelete: "restrict" })
      .notNull(),
    creatorUserId: integer("creator_user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    kind: text("kind").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull().default("pending"),
    providerReference: text("provider_reference"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sourceUnique: unique("ugc_earnings_ledger_source_unique").on(
      table.sourceType,
      table.sourceId,
      table.kind,
    ),
    creatorUpdatedIdx: index("ugc_earnings_ledger_creator_updated_idx").on(
      table.creatorUserId,
      table.updatedAt,
    ),
  }),
);

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

export const assetsRelations = relations(assets, ({ one, many }) => ({
  owner: one(users, { fields: [assets.ownerUserId], references: [users.id] }),
  business: one(businesses, {
    fields: [assets.businessId],
    references: [businesses.id],
  }),
  processingJobs: many(mediaProcessingJobs),
  renditions: many(mediaRenditions),
  textTracks: many(mediaTextTracks),
  collectionItems: many(assetCollectionItems),
  tags: many(assetTags),
  rights: many(assetRights, { relationName: "asset_rights_subject" }),
  rightsEvidence: many(assetRights, { relationName: "asset_rights_evidence" }),
  usageRecords: many(assetUsageRecords),
  playbackSessions: many(mediaPlaybackSessions),
  lineageParents: many(assetLineageEdges, { relationName: "lineage_parent" }),
  lineageChildren: many(assetLineageEdges, { relationName: "lineage_child" }),
}));

export const mediaProcessingJobsRelations = relations(
  mediaProcessingJobs,
  ({ one }) => ({
    asset: one(assets, {
      fields: [mediaProcessingJobs.assetId],
      references: [assets.id],
    }),
    owner: one(users, {
      fields: [mediaProcessingJobs.ownerUserId],
      references: [users.id],
    }),
    business: one(businesses, {
      fields: [mediaProcessingJobs.businessId],
      references: [businesses.id],
    }),
  }),
);

export const mediaRenditionsRelations = relations(
  mediaRenditions,
  ({ one, many }) => ({
    asset: one(assets, {
      fields: [mediaRenditions.assetId],
      references: [assets.id],
    }),
    owner: one(users, {
      fields: [mediaRenditions.ownerUserId],
      references: [users.id],
    }),
    playbackSessions: many(mediaPlaybackSessions),
  }),
);

export const mediaTextTracksRelations = relations(
  mediaTextTracks,
  ({ one }) => ({
    asset: one(assets, {
      fields: [mediaTextTracks.assetId],
      references: [assets.id],
    }),
    owner: one(users, {
      fields: [mediaTextTracks.ownerUserId],
      references: [users.id],
    }),
  }),
);

export const assetLineageEdgesRelations = relations(
  assetLineageEdges,
  ({ one }) => ({
    parent: one(assets, {
      fields: [assetLineageEdges.parentAssetId],
      references: [assets.id],
      relationName: "lineage_parent",
    }),
    child: one(assets, {
      fields: [assetLineageEdges.childAssetId],
      references: [assets.id],
      relationName: "lineage_child",
    }),
    creator: one(users, {
      fields: [assetLineageEdges.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const assetCollectionsRelations = relations(
  assetCollections,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [assetCollections.ownerUserId],
      references: [users.id],
    }),
    business: one(businesses, {
      fields: [assetCollections.businessId],
      references: [businesses.id],
    }),
    items: many(assetCollectionItems),
  }),
);

export const assetCollectionItemsRelations = relations(
  assetCollectionItems,
  ({ one }) => ({
    collection: one(assetCollections, {
      fields: [assetCollectionItems.collectionId],
      references: [assetCollections.id],
    }),
    asset: one(assets, {
      fields: [assetCollectionItems.assetId],
      references: [assets.id],
    }),
    addedBy: one(users, {
      fields: [assetCollectionItems.addedByUserId],
      references: [users.id],
    }),
  }),
);

export const assetTagsRelations = relations(assetTags, ({ one }) => ({
  asset: one(assets, { fields: [assetTags.assetId], references: [assets.id] }),
  owner: one(users, {
    fields: [assetTags.ownerUserId],
    references: [users.id],
  }),
}));

export const assetRightsRelations = relations(assetRights, ({ one }) => ({
  asset: one(assets, {
    fields: [assetRights.assetId],
    references: [assets.id],
    relationName: "asset_rights_subject",
  }),
  evidenceAsset: one(assets, {
    fields: [assetRights.evidenceAssetId],
    references: [assets.id],
    relationName: "asset_rights_evidence",
  }),
  owner: one(users, {
    fields: [assetRights.ownerUserId],
    references: [users.id],
  }),
}));

export const assetUsageRecordsRelations = relations(
  assetUsageRecords,
  ({ one }) => ({
    asset: one(assets, {
      fields: [assetUsageRecords.assetId],
      references: [assets.id],
    }),
    actor: one(users, {
      fields: [assetUsageRecords.actorUserId],
      references: [users.id],
    }),
  }),
);

export const mediaPlaybackSessionsRelations = relations(
  mediaPlaybackSessions,
  ({ one, many }) => ({
    asset: one(assets, {
      fields: [mediaPlaybackSessions.assetId],
      references: [assets.id],
    }),
    rendition: one(mediaRenditions, {
      fields: [mediaPlaybackSessions.renditionId],
      references: [mediaRenditions.id],
    }),
    viewer: one(users, {
      fields: [mediaPlaybackSessions.viewerUserId],
      references: [users.id],
    }),
    events: many(mediaPlaybackEvents),
  }),
);

export const mediaPlaybackEventsRelations = relations(
  mediaPlaybackEvents,
  ({ one }) => ({
    session: one(mediaPlaybackSessions, {
      fields: [mediaPlaybackEvents.sessionId],
      references: [mediaPlaybackSessions.id],
    }),
  }),
);

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
export type MediaProcessingJob = typeof mediaProcessingJobs.$inferSelect;
export type MediaRendition = typeof mediaRenditions.$inferSelect;
export type MediaTextTrack = typeof mediaTextTracks.$inferSelect;
export type AssetLineageEdge = typeof assetLineageEdges.$inferSelect;
export type AssetCollection = typeof assetCollections.$inferSelect;
export type AssetCollectionItem = typeof assetCollectionItems.$inferSelect;
export type AssetTag = typeof assetTags.$inferSelect;
export type AssetRight = typeof assetRights.$inferSelect;
export type AssetUsageRecord = typeof assetUsageRecords.$inferSelect;
export type MediaPlaybackSession = typeof mediaPlaybackSessions.$inferSelect;
export type MediaPlaybackEvent = typeof mediaPlaybackEvents.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type AnalyticsIdentityLink = typeof analyticsIdentityLinks.$inferSelect;
export type AttributionTouch = typeof attributionTouches.$inferSelect;
export type ConversionAttribution = typeof conversionAttributions.$inferSelect;
export type CreativeWorkItem = typeof creativeWorkItems.$inferSelect;
export type CreativeWorkDependency =
  typeof creativeWorkDependencies.$inferSelect;
export type CreativeWorkApproval = typeof creativeWorkApprovals.$inferSelect;
export type CreativeWorkEvent = typeof creativeWorkEvents.$inferSelect;
export type ContentDraft = typeof contentDrafts.$inferSelect;
export type CutStudioProject = typeof cutStudioProjects.$inferSelect;
export type CutStudioJob = typeof cutStudioJobs.$inferSelect;
export type CutStudioProjectMedia = typeof cutStudioProjectMedia.$inferSelect;
export type CutStudioComposition = typeof cutStudioCompositions.$inferSelect;
export type CutStudioProductionPlan = typeof cutStudioProductionPlans.$inferSelect;
export type CutStudioProductionElement = typeof cutStudioProductionElements.$inferSelect;
export type CutStudioShot = typeof cutStudioShots.$inferSelect;
export type CutStudioGenerationJob = typeof cutStudioGenerationJobs.$inferSelect;
export type CutStudioGenerativeWorkflow = typeof cutStudioGenerativeWorkflows.$inferSelect;
export type CutStudioShotVariant = typeof cutStudioShotVariants.$inferSelect;
export type CutStudioVersion = typeof cutStudioVersions.$inferSelect;
export type CutStudioReviewLink = typeof cutStudioReviewLinks.$inferSelect;
export type CutStudioReviewComment =
  typeof cutStudioReviewComments.$inferSelect;
export type CutStudioReviewDecision =
  typeof cutStudioReviewDecisions.$inferSelect;
export type BroadcastStudio = typeof broadcastStudios.$inferSelect;
export type BroadcastStudioCollaborator =
  typeof broadcastStudioCollaborators.$inferSelect;
export type BroadcastBrandKit = typeof broadcastBrandKits.$inferSelect;
export type BroadcastDestination = typeof broadcastDestinations.$inferSelect;
export type BroadcastSession = typeof broadcastSessions.$inferSelect;
export type BroadcastSessionMarker =
  typeof broadcastSessionMarkers.$inferSelect;
export type BroadcastSessionTrack = typeof broadcastSessionTracks.$inferSelect;
export type BroadcastDestinationReceipt =
  typeof broadcastDestinationReceipts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type CampaignDeliverable = typeof campaignDeliverables.$inferSelect;
export type CampaignMetric = typeof campaignMetrics.$inferSelect;
export type UgcCreatorProfile = typeof ugcCreatorProfiles.$inferSelect;
export type UgcPortfolioItem = typeof ugcPortfolioItems.$inferSelect;
export type UgcOpportunity = typeof ugcOpportunities.$inferSelect;
export type UgcApplication = typeof ugcApplications.$inferSelect;
export type UgcCollaboration = typeof ugcCollaborations.$inferSelect;
export type UgcSubmission = typeof ugcSubmissions.$inferSelect;
export type UgcSampleShipment = typeof ugcSampleShipments.$inferSelect;
export type UgcPerformanceSnapshot =
  typeof ugcPerformanceSnapshots.$inferSelect;
export type UgcEarningsLedgerEntry = typeof ugcEarningsLedger.$inferSelect;

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
export type AutomationTriggerEvent =
  typeof automationTriggerEvents.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type AutomationStepRun = typeof automationStepRuns.$inferSelect;
export type AutomationApproval = typeof automationApprovals.$inferSelect;
export type AutomationActionReceipt =
  typeof automationActionReceipts.$inferSelect;
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
export type RelationshipNativeActionReceipt =
  typeof relationshipNativeActionReceipts.$inferSelect;
export type RelationshipAgentAuthorityPolicy =
  typeof relationshipAgentAuthorityPolicies.$inferSelect;
export type RelationshipMemoryFact =
  typeof relationshipMemoryFacts.$inferSelect;
export type RelationshipVoiceProfile =
  typeof relationshipVoiceProfiles.$inferSelect;
export type RelationshipVoiceGenerationJob =
  typeof relationshipVoiceGenerationJobs.$inferSelect;
export type RelationshipAuditEvent =
  typeof relationshipAuditEvents.$inferSelect;
export type RelationshipTenantPolicy =
  typeof relationshipTenantPolicies.$inferSelect;
export type RelationshipUsageLedgerEntry =
  typeof relationshipUsageLedger.$inferSelect;
export type RelationshipUsageReservation =
  typeof relationshipUsageReservations.$inferSelect;
export type RelationshipOperationalAlert =
  typeof relationshipOperationalAlerts.$inferSelect;
export type RelationshipRoomBinding =
  typeof relationshipRoomBindings.$inferSelect;

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
export type CommunityRoomEvent = typeof communityRoomEvents.$inferSelect;
export type CommunityRoomGuestInvite = typeof communityRoomGuestInvites.$inferSelect;
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
export type FoundationInstrument = typeof foundationInstruments.$inferSelect;
export type FoundationInstrumentRevision = typeof foundationInstrumentRevisions.$inferSelect;
export type FoundationInstrumentEvent = typeof foundationInstrumentEvents.$inferSelect;
export type FoundationFormSubmission = typeof foundationFormSubmissions.$inferSelect;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type MobileDeviceRegistration =
  typeof mobileDeviceRegistrations.$inferSelect;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type ConversationParticipant =
  typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<
  typeof insertConversationParticipantSchema
>;

export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;
export type ConversationReadState = typeof conversationReadStates.$inferSelect;

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
