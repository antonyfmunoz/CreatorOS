import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  accountPrivacyRequests,
  assets,
  users,
  type AccountPrivacyRequest,
  type User,
} from "@shared/schema";
import { removeStoredAsset } from "./asset-storage";
import { clerkClient } from "./clerkAdmin";
import {
  accountDeletionRequestFingerprint,
  deletedAccountIdentity,
  sanitizeAccountExport,
  type AccountDeletionBlocker,
} from "./privacy-policy";

type JsonRow = Record<string, unknown>;

function rows(value: unknown): JsonRow[] {
  return Array.isArray(value) ? (value as JsonRow[]) : [];
}

async function exportRows(query: ReturnType<typeof sql>) {
  return rows(await db.execute(query));
}

export async function accountDeletionBlockers(
  userId: number,
): Promise<AccountDeletionBlocker[]> {
  const [businessRows, communityRows] = await Promise.all([
    db.execute(sql`
      select b.id::text as id, b.name,
        count(bm.user_id) filter (where bm.user_id <> ${userId})::int as other_member_count
      from businesses b
      left join business_members bm on bm.business_id = b.id
      where b.owner_user_id = ${userId} and b.status <> 'deleted'
      group by b.id, b.name
      having count(bm.user_id) filter (where bm.user_id <> ${userId}) > 0
    `),
    db.execute(sql`
      select c.id::text as id, c.name,
        count(other_members.user_id)::int as other_member_count
      from communities c
      join community_memberships owner_membership
        on owner_membership.community_id = c.id
       and owner_membership.user_id = ${userId}
       and owner_membership.role = 'owner'
      left join community_memberships other_members
        on other_members.community_id = c.id
       and other_members.user_id <> ${userId}
       and other_members.status = 'active'
      group by c.id, c.name
      having count(other_members.user_id) > 0
    `),
  ]);

  return [
    ...rows(businessRows).map((row) => ({
      kind: "business" as const,
      id: String(row.id),
      name: String(row.name),
      otherMemberCount: Number(row.other_member_count),
      resolution: "Transfer business ownership or remove the remaining members before deleting this account.",
    })),
    ...rows(communityRows).map((row) => ({
      kind: "community" as const,
      id: String(row.id),
      name: String(row.name),
      otherMemberCount: Number(row.other_member_count),
      resolution: "Transfer community ownership before deleting this account.",
    })),
  ];
}

export async function latestAccountDeletionRequest(userId: number) {
  const [request] = await db
    .select()
    .from(accountPrivacyRequests)
    .where(
      and(
        eq(accountPrivacyRequests.userId, userId),
        eq(accountPrivacyRequests.kind, "deletion"),
        inArray(accountPrivacyRequests.status, [
          "scheduled",
          "executing",
          "identity_pending",
          "blocked",
          "failed",
        ]),
      ),
    )
    .orderBy(desc(accountPrivacyRequests.createdAt))
    .limit(1);
  return request ?? null;
}

export async function buildAccountExport(user: User) {
  const userId = user.id;
  const [
    socialContent,
    creatorStudio,
    commerce,
    communities,
    messaging,
    organizations,
    automations,
    relationshipHub,
    privacyRequests,
  ] = await Promise.all([
    Promise.all([
      exportRows(sql`select * from posts where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from comments where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from saved_posts where user_id = ${userId} order by saved_at`),
      exportRows(sql`select * from post_likes where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from playlists where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from stories where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from story_views where user_id = ${userId} order by viewed_at`),
      exportRows(sql`select * from story_reactions where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from followers where follower_id = ${userId} or followed_id = ${userId} order by created_at`),
      exportRows(sql`select * from tagged_users where user_id = ${userId} order by created_at`),
    ]),
    Promise.all([
      exportRows(sql`select * from content_drafts where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from distribution_jobs where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from social_connections where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from assets where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from products where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from campaigns where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from ai_agents where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from ai_chats where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from revenue where user_id = ${userId} order by date`),
      exportRows(sql`select * from contacts where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from documents where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from cut_studio_projects where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from cut_studio_jobs where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from cut_studio_versions where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select id, version_id, project_id, owner_user_id, label, status, expires_at, created_at from cut_studio_review_links where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select c.* from cut_studio_review_comments c join cut_studio_versions v on v.id = c.version_id where v.owner_user_id = ${userId} order by c.created_at`),
      exportRows(sql`select d.* from cut_studio_review_decisions d join cut_studio_versions v on v.id = d.version_id where v.owner_user_id = ${userId} order by d.created_at`),
      exportRows(sql`select * from broadcast_studios where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select id, owner_user_id, business_id, name, protocol, ingest_url, status, created_at, updated_at from broadcast_destinations where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from broadcast_sessions where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from broadcast_brand_kits where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from broadcast_session_tracks where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from broadcast_studio_collaborators where user_id = ${userId} or invited_by_user_id = ${userId} order by created_at`),
    ]),
    Promise.all([
      exportRows(sql`select * from purchases where buyer_id = ${userId} order by purchased_at`),
      exportRows(sql`select * from orders where buyer_id = ${userId} order by created_at`),
      exportRows(sql`select * from creator_payment_accounts where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from creator_earnings_allocations where seller_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from entitlements where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from shopping_cart_items where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from product_saves where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from product_reviews where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from course_progress where user_id = ${userId} order by completed_at`),
      exportRows(sql`select * from course_assessment_attempts where user_id = ${userId} order by completed_at`),
      exportRows(sql`select * from creator_payout_events where seller_user_id = ${userId} order by updated_at`),
      exportRows(sql`select cpe.* from commerce_provider_events cpe join orders o on o.id = cpe.order_id where o.buyer_id = ${userId} or o.id in (select order_id from creator_earnings_allocations where seller_user_id = ${userId}) order by cpe.received_at`),
    ]),
    Promise.all([
      exportRows(sql`select * from community_memberships where user_id = ${userId} order by joined_at`),
      exportRows(sql`select * from community_moderation_actions where actor_user_id = ${userId} or target_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from channel_messages where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from channel_message_likes where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from channel_polls where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from channel_poll_votes where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from events where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from event_attendees where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from community_rooms where host_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from community_room_attendees where user_id = ${userId} order by created_at`),
      exportRows(sql`select * from community_room_notes where author_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from community_room_action_items where created_by_user_id = ${userId} or assignee_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from community_room_consents where user_id = ${userId} order by created_at`),
    ]),
    Promise.all([
      exportRows(sql`select * from conversation_participants where user_id = ${userId} order by joined_at`),
      exportRows(sql`select * from direct_messages where sender_id = ${userId} order by sent_at`),
      exportRows(sql`select * from notifications where user_id = ${userId} order by created_at`),
    ]),
    Promise.all([
      exportRows(sql`select * from businesses where owner_user_id = ${userId} or id in (select business_id from business_members where user_id = ${userId}) order by created_at`),
      exportRows(sql`select * from business_members where user_id = ${userId} order by created_at`),
      exportRows(sql`select c.* from communities c join community_memberships cm on cm.community_id = c.id where cm.user_id = ${userId} order by c.created_at`),
      exportRows(sql`select * from content_reports where reporter_user_id = ${userId} or reviewer_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from projection_events where actor_user_id = ${userId} order by occurred_at`),
      exportRows(sql`select * from umh_approvals where approved_by_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from umh_audit_records where actor_user_id = ${userId} order by created_at`),
    ]),
    Promise.all([
      exportRows(sql`select * from automation_definitions where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from automation_trigger_events where owner_user_id = ${userId} order by received_at`),
      exportRows(sql`select * from automation_contact_states where owner_user_id = ${userId} or contact_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from automation_threads where owner_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from automation_messages where author_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from automation_audit_events where actor_user_id = ${userId} order by created_at`),
    ]),
    Promise.all([
      exportRows(sql`select * from relationships where business_id in (select id from businesses where owner_user_id = ${userId}) order by created_at`),
      exportRows(sql`select * from relationship_consents where business_id in (select id from businesses where owner_user_id = ${userId}) order by created_at`),
      exportRows(sql`select * from relationship_conversations where business_id in (select id from businesses where owner_user_id = ${userId}) order by created_at`),
      exportRows(sql`select * from relationship_messages where business_id in (select id from businesses where owner_user_id = ${userId}) order by created_at limit 100000`),
      exportRows(sql`select * from relationship_notes where author_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from relationship_tasks where created_by_user_id = ${userId} or assigned_to_user_id = ${userId} order by created_at`),
      exportRows(sql`select * from relationship_audit_events where actor_user_id = ${userId} order by created_at limit 100000`),
    ]),
    exportRows(sql`select * from account_privacy_requests where user_id = ${userId} order by created_at`),
  ]);

  const payload = {
    schemaVersion: "creativesos.account-export.v1",
    exportedAt: new Date().toISOString(),
    account: user,
    socialContent: {
      posts: socialContent[0], comments: socialContent[1], savedPosts: socialContent[2],
      postLikes: socialContent[3], playlists: socialContent[4], stories: socialContent[5],
      storyViews: socialContent[6], storyReactions: socialContent[7], follows: socialContent[8], tags: socialContent[9],
    },
    creatorStudio: {
      drafts: creatorStudio[0], distributionJobs: creatorStudio[1], socialConnections: creatorStudio[2],
      assets: creatorStudio[3], products: creatorStudio[4], campaigns: creatorStudio[5],
      aiAgents: creatorStudio[6], aiChats: creatorStudio[7], revenue: creatorStudio[8],
      contacts: creatorStudio[9], documents: creatorStudio[10],
      cutStudioProjects: creatorStudio[11], cutStudioJobs: creatorStudio[12],
      cutStudioVersions: creatorStudio[13], cutStudioReviewLinks: creatorStudio[14],
      cutStudioReviewComments: creatorStudio[15], cutStudioReviewDecisions: creatorStudio[16],
      broadcastStudios: creatorStudio[17], broadcastDestinations: creatorStudio[18], broadcastSessions: creatorStudio[19],
      broadcastBrandKits: creatorStudio[20],
      broadcastSessionTracks: creatorStudio[21],
      broadcastStudioCollaborations: creatorStudio[22],
    },
    commerce: {
      purchases: commerce[0], orders: commerce[1], creatorPaymentAccounts: commerce[2],
      creatorEarnings: commerce[3], entitlements: commerce[4], cart: commerce[5],
      savedProducts: commerce[6], reviews: commerce[7], courseProgress: commerce[8], assessments: commerce[9],
      creatorPayouts: commerce[10], providerEvents: commerce[11],
    },
    communities: {
      memberships: communities[0], moderation: communities[1], messages: communities[2],
      messageLikes: communities[3], polls: communities[4], pollVotes: communities[5],
      events: communities[6], eventAttendance: communities[7], roomsHosted: communities[8],
      roomAttendance: communities[9], roomNotes: communities[10], roomActions: communities[11], roomConsents: communities[12],
    },
    messaging: { conversationMemberships: messaging[0], sentMessages: messaging[1], notifications: messaging[2] },
    organizations: {
      businesses: organizations[0], businessMemberships: organizations[1], communities: organizations[2],
      reports: organizations[3], projectionEvents: organizations[4], umhApprovals: organizations[5], umhAudit: organizations[6],
    },
    automations: {
      definitions: automations[0], triggerEvents: automations[1], contactStates: automations[2],
      threads: automations[3], authoredMessages: automations[4], auditEvents: automations[5],
    },
    relationshipHub: {
      relationships: relationshipHub[0], consents: relationshipHub[1], conversations: relationshipHub[2],
      messages: relationshipHub[3], notes: relationshipHub[4], tasks: relationshipHub[5], auditEvents: relationshipHub[6],
    },
    privacyRequests,
  };

  return sanitizeAccountExport(payload);
}

async function eraseLocalAccountData(request: AccountPrivacyRequest, user: User) {
  const blockers = await accountDeletionBlockers(user.id);
  if (blockers.length > 0) {
    await db.update(accountPrivacyRequests).set({
      status: "blocked",
      failureCode: "ownership_transfer_required",
      metadata: { blockers },
      updatedAt: new Date(),
    }).where(eq(accountPrivacyRequests.id, request.id));
    return false;
  }

  const ownedAssets = await db.select({
    storageKey: assets.storageKey,
    visibility: assets.visibility,
  }).from(assets).where(eq(assets.ownerUserId, user.id));

  for (const asset of ownedAssets) {
    const visibility = asset.visibility === "private" ? "private" : "public";
    await removeStoredAsset(asset.storageKey, visibility);
  }

  const userId = user.id;
  await db.transaction(async (tx) => {
    // Preserve immutable financial evidence while removing its organization
    // pointer. The user row is pseudonymized below so retained ledgers no
    // longer contain account identity.
    await tx.execute(sql`update orders set business_id = null where business_id in (select id from businesses where owner_user_id = ${userId})`);
    await tx.execute(sql`update products set business_id = null, community_id = null, status = 'archived', title = 'Removed offer', description = '', image_url = null where user_id = ${userId}`);

    // Durable automation runs restrict definition deletion. Remove the private
    // run graph first, then let business deletion cascade through the rest.
    await tx.execute(sql`delete from automation_runs where definition_id in (select id from automation_definitions where owner_user_id = ${userId})`);
    await tx.execute(sql`delete from automation_threads where owner_user_id = ${userId}`);
    await tx.execute(sql`delete from automation_trigger_events where owner_user_id = ${userId}`);
    await tx.execute(sql`delete from automation_contact_states where owner_user_id = ${userId} or contact_user_id = ${userId}`);
    await tx.execute(sql`delete from automation_definitions where owner_user_id = ${userId}`);

    // A community owned by this account can be removed only when preflight
    // proved that no other active member depends on it.
    await tx.execute(sql`
      delete from communities where id in (
        select community_id from community_memberships
        where user_id = ${userId} and role = 'owner'
      )
    `);

    await tx.execute(sql`delete from businesses where owner_user_id = ${userId}`);
    await tx.execute(sql`delete from business_members where user_id = ${userId}`);

    await tx.execute(sql`delete from posts where user_id = ${userId}`);
    await tx.execute(sql`delete from comments where user_id = ${userId}`);
    await tx.execute(sql`delete from saved_posts where user_id = ${userId}`);
    await tx.execute(sql`delete from post_likes where user_id = ${userId}`);
    await tx.execute(sql`delete from playlists where user_id = ${userId}`);
    await tx.execute(sql`delete from stories where user_id = ${userId}`);
    await tx.execute(sql`delete from story_views where user_id = ${userId}`);
    await tx.execute(sql`delete from story_reactions where user_id = ${userId}`);
    await tx.execute(sql`delete from followers where follower_id = ${userId} or followed_id = ${userId}`);
    await tx.execute(sql`delete from tagged_users where user_id = ${userId}`);

    await tx.execute(sql`delete from content_drafts where user_id = ${userId}`);
    await tx.execute(sql`delete from distribution_jobs where user_id = ${userId}`);
    await tx.execute(sql`delete from social_oauth_states where user_id = ${userId}`);
    await tx.execute(sql`delete from social_connections where user_id = ${userId}`);
    await tx.execute(sql`delete from asset_product_access where created_by_user_id = ${userId}`);
    await tx.execute(sql`delete from assets where owner_user_id = ${userId}`);
    await tx.execute(sql`delete from ai_chats where user_id = ${userId}`);
    await tx.execute(sql`delete from ai_agents where user_id = ${userId}`);
    await tx.execute(sql`delete from revenue where user_id = ${userId}`);
    await tx.execute(sql`delete from contacts where user_id = ${userId}`);
    await tx.execute(sql`delete from documents where user_id = ${userId}`);

    await tx.execute(sql`delete from product_saves where user_id = ${userId}`);
    await tx.execute(sql`delete from shopping_cart_items where user_id = ${userId}`);
    await tx.execute(sql`delete from product_reviews where user_id = ${userId}`);
    await tx.execute(sql`delete from course_progress where user_id = ${userId}`);
    await tx.execute(sql`delete from course_assessment_attempts where user_id = ${userId}`);
    await tx.execute(sql`delete from creator_payment_accounts where user_id = ${userId}`);
    await tx.execute(sql`delete from stripe_connect_oauth_states where user_id = ${userId}`);

    await tx.execute(sql`update direct_messages set content = '[deleted]', reactions = '{}'::json, is_edited = true where sender_id = ${userId}`);
    await tx.execute(sql`delete from conversation_participants where user_id = ${userId}`);
    await tx.execute(sql`update channel_messages set content = '[deleted]', is_pinned = false where user_id = ${userId}`);
    await tx.execute(sql`update channel_polls set question = '[deleted]' where user_id = ${userId}`);
    await tx.execute(sql`delete from channel_message_likes where user_id = ${userId}`);
    await tx.execute(sql`delete from channel_poll_votes where user_id = ${userId}`);
    await tx.execute(sql`delete from community_memberships where user_id = ${userId}`);
    await tx.execute(sql`delete from events where user_id = ${userId}`);
    await tx.execute(sql`delete from event_attendees where user_id = ${userId}`);
    await tx.execute(sql`delete from community_room_attendees where user_id = ${userId}`);
    await tx.execute(sql`delete from community_room_notes where author_user_id = ${userId}`);
    await tx.execute(sql`update community_room_action_items set body = '[deleted]' where created_by_user_id = ${userId}`);
    await tx.execute(sql`update community_rooms set title = 'Deleted account meeting', description = '', join_url = null, status = case when status = 'ended' then status else 'canceled' end where host_user_id = ${userId}`);
    await tx.execute(sql`update community_room_transcript_segments set speaker_user_id = null where speaker_user_id = ${userId}`);

    await tx.execute(sql`delete from notifications where user_id = ${userId}`);
    await tx.execute(sql`update notifications set related_user_id = null, related_user_image = null where related_user_id = ${userId}`);

    await tx.execute(sql`update projection_events set actor_user_id = null where actor_user_id = ${userId}`);
    await tx.execute(sql`update umh_commands set delegated_user_id = null where delegated_user_id = ${userId}`);
    await tx.execute(sql`update umh_approvals set approved_by_user_id = null where approved_by_user_id = ${userId}`);
    await tx.execute(sql`update umh_audit_records set actor_user_id = null where actor_user_id = ${userId}`);
    await tx.execute(sql`update content_reports set reviewer_user_id = null where reviewer_user_id = ${userId}`);

    await tx.update(users).set({
      authEmail: null,
      displayName: "Deleted account",
      bio: null,
      profileImageUrl: null,
      role: "deleted",
      status: "deleted",
      xpPoints: 0,
      level: 1,
      deletedAt: new Date(),
    }).where(eq(users.id, userId));

    await tx.update(accountPrivacyRequests).set({
      status: "identity_pending",
      failureCode: null,
      metadata: {
        localErasureCompleted: true,
        fingerprint: accountDeletionRequestFingerprint(userId, request.scheduledFor ?? request.createdAt),
      },
      updatedAt: new Date(),
    }).where(eq(accountPrivacyRequests.id, request.id));
  });
  return true;
}

async function deleteIdentityProviderAccount(
  request: AccountPrivacyRequest,
  user: User,
) {
  const skipProvider =
    process.env.PRIVACY_SKIP_IDENTITY_PROVIDER === "true" ||
    process.env.CREATOROS_DEMO_MODE === "true";
  if (!skipProvider) await clerkClient.users.deleteUser(user.clerkId);
  const tombstone = deletedAccountIdentity(user.id, request.id);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ clerkId: tombstone.clerkId, username: tombstone.username }).where(eq(users.id, user.id));
    await tx.update(accountPrivacyRequests).set({
      status: "completed",
      completedAt: new Date(),
      failureCode: null,
      metadata: {
        ...(request.metadata ?? {}),
        localErasureCompleted: true,
        identityProviderDeleted: !skipProvider,
      },
      updatedAt: new Date(),
    }).where(eq(accountPrivacyRequests.id, request.id));
  });
}

export async function executeAccountDeletionRequest(requestId: string) {
  const [request] = await db.update(accountPrivacyRequests).set({
    status: "executing",
    failureCode: null,
    updatedAt: new Date(),
  }).where(and(
    eq(accountPrivacyRequests.id, requestId),
    eq(accountPrivacyRequests.kind, "deletion"),
    inArray(accountPrivacyRequests.status, ["scheduled", "identity_pending", "failed"]),
  )).returning();
  if (!request) {
    const [existing] = await db.select().from(accountPrivacyRequests).where(eq(accountPrivacyRequests.id, requestId)).limit(1);
    return { status: existing?.status ?? ("missing" as const) };
  }
  const [user] = await db.select().from(users).where(eq(users.id, request.userId)).limit(1);
  if (!user) {
    await db.update(accountPrivacyRequests).set({ status: "failed", failureCode: "missing_user", updatedAt: new Date() }).where(eq(accountPrivacyRequests.id, request.id));
    return { status: "missing_user" as const };
  }
  let localComplete = Boolean((request.metadata as JsonRow | null)?.localErasureCompleted) || user.status === "deleted";
  try {
    if (!localComplete && !(await eraseLocalAccountData(request, user))) return { status: "blocked" as const };
    localComplete = true;
    const refreshedRequest = (await db.select().from(accountPrivacyRequests).where(eq(accountPrivacyRequests.id, request.id)).limit(1))[0] ?? request;
    await deleteIdentityProviderAccount(refreshedRequest, user);
    return { status: "completed" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(accountPrivacyRequests).set({
      status: localComplete ? "identity_pending" : "failed",
      failureCode: message.slice(0, 120),
      updatedAt: new Date(),
    }).where(eq(accountPrivacyRequests.id, request.id));
    throw error;
  }
}

export async function processDueAccountPrivacyRequests(limit = 5) {
  const staleExecutionCutoff = new Date(Date.now() - 15 * 60 * 1_000);
  await db.update(accountPrivacyRequests).set({
    status: "failed",
    failureCode: "interrupted_execution",
    updatedAt: new Date(),
  }).where(and(
    eq(accountPrivacyRequests.status, "executing"),
    lte(accountPrivacyRequests.updatedAt, staleExecutionCutoff),
  ));
  const due = await db.select().from(accountPrivacyRequests).where(and(
    inArray(accountPrivacyRequests.status, ["scheduled", "identity_pending", "failed"]),
    lte(accountPrivacyRequests.scheduledFor, new Date()),
  )).orderBy(asc(accountPrivacyRequests.scheduledFor)).limit(limit);
  const result = { completed: 0, blocked: 0, failed: 0 };
  for (const request of due) {
    try {
      const outcome = await executeAccountDeletionRequest(request.id);
      if (outcome.status === "completed") result.completed += 1;
      else if (outcome.status === "blocked") result.blocked += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Account privacy request failed:", request.id, error instanceof Error ? error.message : error);
    }
  }
  return result;
}
