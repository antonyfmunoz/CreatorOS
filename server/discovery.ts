import crypto from "node:crypto";
import type { Express } from "express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  contentModerationStateSchema,
  discoveryPolicySchema,
  discoveryPreferenceSchema,
  feedModes,
  selectDiverseDiscoveryCandidates,
} from "@shared/discovery";
import { userSafetyControlSchema } from "@shared/native-social-safety";
import {
  communities,
  contentModerationStates,
  discoveryExposures,
  discoveryPolicies,
  discoveryPreferences,
  followers,
  posts,
  products,
  searchDocuments,
  userBlocks,
  userSafetyControls,
  users,
} from "@shared/schema";
import { attachUser } from "./auth";
import { db } from "./db";
import { normalizeSearchQuery } from "./search-query";

const defaultWeights = {
  recency: 2.8,
  engagement: 1.4,
  relationship: 3.2,
  interest: 2.4,
  quality: 1.1,
};
const defaultGuardrails = {
  maxPerCreator: 2,
  candidateWindow: 200,
  sensitivePenalty: 0.25,
  diversityTopics: true,
  minimumCreatorShare: 0.02,
};
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

async function activePolicy(userId: number) {
  let [policy] = await db
    .select()
    .from(discoveryPolicies)
    .where(
      and(
        eq(discoveryPolicies.key, "native_feed"),
        eq(discoveryPolicies.status, "active"),
      ),
    )
    .limit(1);
  if (!policy) {
    [policy] = await db
      .insert(discoveryPolicies)
      .values({
        key: "native_feed",
        version: 1,
        status: "active",
        weights: defaultWeights,
        guardrails: defaultGuardrails,
        createdByUserId: userId,
        activatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!policy)
      [policy] = await db
        .select()
        .from(discoveryPolicies)
        .where(
          and(
            eq(discoveryPolicies.key, "native_feed"),
            eq(discoveryPolicies.status, "active"),
          ),
        )
        .limit(1);
  }
  return policy;
}

function topics(content: string) {
  return Array.from(
    content.matchAll(/(?:^|\s)#([A-Za-z0-9_]{2,40})/g),
    (match) => match[1].toLowerCase(),
  );
}

async function synchronizeSearchIndex() {
  const [userRows, productRows, postRows, communityRows, moderation] =
    await Promise.all([
      db.select().from(users).limit(10_000),
      db
        .select()
        .from(products)
        .where(eq(products.status, "published"))
        .limit(10_000),
      db.select().from(posts).orderBy(desc(posts.createdAt)).limit(20_000),
      db
        .select()
        .from(communities)
        .where(isNull(communities.archivedAt))
        .limit(10_000),
      db.select().from(contentModerationStates),
    ]);
  const state = new Map(
    moderation.map((row) => [`${row.targetType}:${row.targetId}`, row]),
  );
  const documents: Array<typeof searchDocuments.$inferInsert> = [
    ...userRows.map((row) => ({
      entityType: "user",
      entityId: String(row.id),
      ownerUserId: row.id,
      title: row.displayName,
      body: `${row.username} ${row.bio ?? ""}`,
      metadata: { username: row.username },
      status:
        state.get(`user:${row.id}`)?.visibility === "visible" ||
        !state.has(`user:${row.id}`)
          ? "active"
          : state.get(`user:${row.id}`)!.visibility,
    })),
    ...productRows.map((row) => ({
      entityType: "product",
      entityId: String(row.id),
      ownerUserId: row.userId,
      title: row.title,
      body: `${row.description} ${row.category}`,
      metadata: { category: row.category },
      status:
        state.get(`product:${row.id}`)?.visibility === "visible" ||
        !state.has(`product:${row.id}`)
          ? "active"
          : state.get(`product:${row.id}`)!.visibility,
    })),
    ...postRows.map((row) => ({
      entityType: "post",
      entityId: String(row.id),
      ownerUserId: row.userId,
      title: row.content.slice(0, 160) || "Post",
      body: row.content,
      metadata: { mediaType: row.mediaType, topics: topics(row.content) },
      status:
        state.get(`post:${row.id}`)?.visibility === "visible" ||
        !state.has(`post:${row.id}`)
          ? "active"
          : state.get(`post:${row.id}`)!.visibility,
    })),
    ...communityRows.map((row) => ({
      entityType: "community",
      entityId: String(row.id),
      ownerUserId: null,
      title: row.name,
      body: row.description,
      metadata: {},
      status:
        state.get(`community:${row.id}`)?.visibility === "visible" ||
        !state.has(`community:${row.id}`)
          ? "active"
          : state.get(`community:${row.id}`)!.visibility,
    })),
  ];
  for (let offset = 0; offset < documents.length; offset += 500)
    await db
      .insert(searchDocuments)
      .values(documents.slice(offset, offset + 500))
      .onConflictDoUpdate({
        target: [searchDocuments.entityType, searchDocuments.entityId],
        set: {
          ownerUserId: sql`excluded.owner_user_id`,
          visibility: sql`excluded.visibility`,
          status: sql`excluded.status`,
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          metadata: sql`excluded.metadata`,
          updatedAt: new Date(),
        },
      });
}

export function registerDiscoveryRoutes(app: Express) {
  app.get("/api/discovery/feed", attachUser, async (req, res) => {
    const mode =
      typeof req.query.mode === "string" &&
      feedModes.includes(req.query.mode as (typeof feedModes)[number])
        ? (req.query.mode as (typeof feedModes)[number])
        : "recommended";
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const policy = await activePolicy(req.dbUser!.id);
    const guardrails = { ...defaultGuardrails, ...policy.guardrails };
    const weights = { ...defaultWeights, ...policy.weights };
    const [
      candidateRows,
      follows,
      blocks,
      safetyControls,
      moderation,
      preferences,
    ] = await Promise.all([
      db
        .select({
          post: posts,
          creator: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            bio: users.bio,
            profileImageUrl: users.profileImageUrl,
          },
        })
        .from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .orderBy(desc(posts.createdAt))
        .limit(Number(guardrails.candidateWindow)),
      db
        .select()
        .from(followers)
        .where(eq(followers.followerId, req.dbUser!.id)),
      db
        .select()
        .from(userBlocks)
        .where(
          or(
            eq(userBlocks.blockerUserId, req.dbUser!.id),
            eq(userBlocks.blockedUserId, req.dbUser!.id),
          ),
        ),
      db
        .select()
        .from(userSafetyControls)
        .where(eq(userSafetyControls.actorUserId, req.dbUser!.id)),
      db
        .select()
        .from(contentModerationStates)
        .where(eq(contentModerationStates.targetType, "post")),
      db
        .select()
        .from(discoveryPreferences)
        .where(eq(discoveryPreferences.userId, req.dbUser!.id))
        .limit(1),
    ]);
    const followed = new Set(follows.map((row) => row.followedId));
    const blocked = new Set(
      blocks
        .flatMap((row) => [row.blockerUserId, row.blockedUserId])
        .filter((id) => id !== req.dbUser!.id),
    );
    const muted = new Set(
      safetyControls
        .filter((control) => control.muted)
        .map((control) => control.targetUserId),
    );
    const pref = preferences[0];
    const hidden = new Set(pref?.hiddenCreatorIds ?? []);
    const interests = new Set(pref?.interests ?? []);
    const state = new Map(moderation.map((row) => [row.targetId, row]));
    const now = Date.now();
    const scored = candidateRows
      .filter(
        ({ post }) =>
          !blocked.has(post.userId) &&
          !muted.has(post.userId) &&
          !hidden.has(post.userId) &&
          (mode !== "following" || followed.has(post.userId)) &&
          state.get(String(post.id))?.visibility !== "removed" &&
          state.get(String(post.id))?.visibility !== "restricted" &&
          !(
            state.get(String(post.id))?.sensitive &&
            pref?.sensitiveContent === "hide"
          ),
      )
      .map(({ post, creator }) => {
        const ageHours = Math.max(
          0,
          (now - post.createdAt.getTime()) / 3_600_000,
        );
        const recency = Math.exp(-ageHours / 72);
        const engagement = Math.log1p(post.likes + post.comments * 2);
        const postTopics = topics(post.content);
        const interestMatches = postTopics.filter((topic) =>
          interests.has(topic),
        ).length;
        const quality =
          Math.min(1, post.content.length / 280) +
          (post.mediaType && post.mediaType !== "text" ? 0.5 : 0);
        const relationship = followed.has(post.userId) ? 1 : 0;
        const sensitive = Boolean(state.get(String(post.id))?.sensitive);
        const score =
          mode === "chronological" || mode === "following"
            ? post.createdAt.getTime()
            : recency * weights.recency +
              engagement * weights.engagement +
              relationship * weights.relationship +
              interestMatches * weights.interest +
              quality * weights.quality -
              (sensitive ? Number(guardrails.sensitivePenalty) : 0);
        const explanation = [
          relationship
            ? "From a creator you follow"
            : "Discover a creator outside your current graph",
          interestMatches
            ? `Matches ${interestMatches} declared interest${interestMatches === 1 ? "" : "s"}`
            : "Relevant based on current discovery signals",
          engagement > 1
            ? "People are engaging with this post"
            : "Fresh content",
          sensitive
            ? "Sensitive-content ranking reduced"
            : "Passed safety filters",
        ];
        return {
          post,
          creator,
          score,
          explanation,
          topic: postTopics[0] ?? post.mediaType ?? "general",
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.post.createdAt.getTime() - left.post.createdAt.getTime(),
      );
    // A creator must be able to see the result of their latest publication in
    // the recommended feed. Preserve one deterministic self-publication slot,
    // then let the ranking and diversity guardrails govern the remaining feed.
    const newestOwned =
      mode === "recommended"
        ? scored
            .filter((candidate) => candidate.post.userId === req.dbUser!.id)
            .sort(
              (left, right) =>
                right.post.createdAt.getTime() - left.post.createdAt.getTime(),
            )[0]
        : undefined;
    const selected = selectDiverseDiscoveryCandidates(scored, {
      limit,
      maxPerCreator: Number(guardrails.maxPerCreator),
      diversityTopics: Boolean(guardrails.diversityTopics),
      creatorId: (candidate) => candidate.post.userId,
      topic: (candidate) => candidate.topic,
      pinned: newestOwned,
    });
    const requestId = crypto.randomUUID();
    if (selected.length)
      await db
        .insert(discoveryExposures)
        .values(
          selected.map((candidate, index) => ({
            userId: req.dbUser!.id,
            postId: candidate.post.id,
            mode,
            policyVersion: policy.version,
            rank: index + 1,
            score: candidate.score,
            explanation: candidate.explanation,
            requestId,
          })),
        )
        .onConflictDoNothing();
    return res.json({
      contractVersion: "creativesos.discovery.feed.v1",
      mode,
      requestId,
      policy: { key: policy.key, version: policy.version },
      items: selected.map((candidate, index) => ({
        ...candidate.post,
        user: candidate.creator,
        discovery: {
          rank: index + 1,
          score: candidate.score,
          explanation: candidate.explanation,
          policyVersion: policy.version,
        },
      })),
    });
  });

  app.put("/api/discovery/preferences", attachUser, async (req, res) => {
    const parsed = discoveryPreferenceSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message:
          parsed.error.issues[0]?.message ?? "Invalid discovery preferences",
      });
    const [preference] = await db
      .insert(discoveryPreferences)
      .values({ userId: req.dbUser!.id, ...parsed.data })
      .onConflictDoUpdate({
        target: discoveryPreferences.userId,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning();
    return res.json(preference);
  });
  app.post("/api/discovery/blocks/:userId", attachUser, async (req, res) => {
    const blockedUserId = Number(req.params.userId);
    if (!Number.isInteger(blockedUserId) || blockedUserId === req.dbUser!.id)
      return res.status(400).json({ message: "Choose another valid user" });
    const [block] = await db
      .insert(userBlocks)
      .values({ blockerUserId: req.dbUser!.id, blockedUserId })
      .onConflictDoNothing()
      .returning();
    return res
      .status(block ? 201 : 200)
      .json(block ?? { status: "already_blocked" });
  });
  app.delete("/api/discovery/blocks/:userId", attachUser, async (req, res) => {
    await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerUserId, req.dbUser!.id),
          eq(userBlocks.blockedUserId, Number(req.params.userId)),
        ),
      );
    return res.status(204).end();
  });
  app.get("/api/discovery/safety-controls", attachUser, async (req, res) =>
    res.json(
      await db
        .select()
        .from(userSafetyControls)
        .where(eq(userSafetyControls.actorUserId, req.dbUser!.id)),
    ),
  );
  app.put(
    "/api/discovery/safety-controls/:userId",
    attachUser,
    async (req, res) => {
      const targetUserId = Number(req.params.userId);
      if (!Number.isInteger(targetUserId) || targetUserId === req.dbUser!.id)
        return res.status(400).json({ message: "Choose another valid user" });
      const parsed = userSafetyControlSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          message: "muted and restricted must be booleans",
          issues: parsed.error.issues,
        });
      const [control] = await db
        .insert(userSafetyControls)
        .values({
          actorUserId: req.dbUser!.id,
          targetUserId,
          muted: parsed.data.muted,
          restricted: parsed.data.restricted,
        })
        .onConflictDoUpdate({
          target: [
            userSafetyControls.actorUserId,
            userSafetyControls.targetUserId,
          ],
          set: {
            muted: parsed.data.muted,
            restricted: parsed.data.restricted,
            updatedAt: new Date(),
          },
        })
        .returning();
      return res.json(control);
    },
  );
  app.delete(
    "/api/discovery/safety-controls/:userId",
    attachUser,
    async (req, res) => {
      await db
        .delete(userSafetyControls)
        .where(
          and(
            eq(userSafetyControls.actorUserId, req.dbUser!.id),
            eq(userSafetyControls.targetUserId, Number(req.params.userId)),
          ),
        );
      return res.status(204).end();
    },
  );

  app.get("/api/search", async (req, res) => {
    const query = normalizeSearchQuery(req.query.query);
    if (!query)
      return res.json({
        users: [],
        products: [],
        posts: [],
        communities: [],
        search: { contractVersion: "creativesos.search.v1", indexed: true },
      });
    await synchronizeSearchIndex();
    const result = await db.execute(
      sql`select entity_type, entity_id, ts_rank(search_vector, websearch_to_tsquery('english', ${query})) as rank from search_documents where visibility = 'public' and status = 'active' and search_vector @@ websearch_to_tsquery('english', ${query}) order by rank desc, updated_at desc limit 50`,
    );
    const rows = Array.from(result) as unknown as Array<{
      entity_type: string;
      entity_id: string;
      rank: number;
    }>;
    const ids = (type: string) =>
      rows
        .filter((row) => row.entity_type === type)
        .map((row) => Number(row.entity_id))
        .filter(Number.isInteger);
    const [userRows, productRows, postRows, communityRows] = await Promise.all([
      ids("user").length
        ? db
            .select(publicUserFields)
            .from(users)
            .where(inArray(users.id, ids("user")))
        : [],
      ids("product").length
        ? db
            .select({ product: products, user: publicUserFields })
            .from(products)
            .innerJoin(users, eq(products.userId, users.id))
            .where(
              and(
                inArray(products.id, ids("product")),
                eq(products.status, "published"),
              ),
            )
        : [],
      ids("post").length
        ? db
            .select({ post: posts, user: publicUserFields })
            .from(posts)
            .innerJoin(users, eq(posts.userId, users.id))
            .where(inArray(posts.id, ids("post")))
        : [],
      ids("community").length
        ? db
            .select()
            .from(communities)
            .where(
              and(
                inArray(communities.id, ids("community")),
                isNull(communities.archivedAt),
              ),
            )
        : [],
    ]);
    const rank = new Map(
      rows.map((row) => [
        `${row.entity_type}:${row.entity_id}`,
        Number(row.rank),
      ]),
    );
    const sort = <T>(type: string, values: T[], getId: (value: T) => number) =>
      values.sort(
        (left, right) =>
          (rank.get(`${type}:${getId(right)}`) ?? 0) -
          (rank.get(`${type}:${getId(left)}`) ?? 0),
      );
    const rankedProducts = sort(
      "product",
      productRows,
      (row) => row.product.id,
    ).map(({ product, user }) => ({ ...product, user }));
    const rankedPosts = sort("post", postRows, (row) => row.post.id).map(
      ({ post, user }) => ({ ...post, user }),
    );
    return res.json({
      users: sort("user", userRows, (row) => row.id),
      products: rankedProducts,
      posts: rankedPosts,
      communities: sort("community", communityRows, (row) => row.id),
      search: {
        contractVersion: "creativesos.search.v1",
        indexed: true,
        query,
        resultCount: rows.length,
      },
    });
  });

  app.get("/api/discovery/policy", attachUser, async (req, res) =>
    res.json(await activePolicy(req.dbUser!.id)),
  );
  app.post("/api/discovery/policies", attachUser, async (req, res) => {
    if (req.dbUser!.role !== "admin")
      return res.status(403).json({ message: "Administrator access required" });
    const parsed = discoveryPolicySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid discovery policy",
      });
    const [policy] = await db
      .insert(discoveryPolicies)
      .values({
        ...parsed.data,
        status: "draft",
        createdByUserId: req.dbUser!.id,
      })
      .returning();
    return res.status(201).json(policy);
  });
  app.post(
    "/api/discovery/policies/:id/activate",
    attachUser,
    async (req, res) => {
      if (req.dbUser!.role !== "admin")
        return res
          .status(403)
          .json({ message: "Administrator access required" });
      const [candidate] = await db
        .select()
        .from(discoveryPolicies)
        .where(eq(discoveryPolicies.id, req.params.id))
        .limit(1);
      if (!candidate)
        return res.status(404).json({ message: "Policy not found" });
      await db.transaction(async (tx) => {
        await tx
          .update(discoveryPolicies)
          .set({ status: "retired" })
          .where(
            and(
              eq(discoveryPolicies.key, candidate.key),
              eq(discoveryPolicies.status, "active"),
            ),
          );
        await tx
          .update(discoveryPolicies)
          .set({ status: "active", activatedAt: new Date() })
          .where(eq(discoveryPolicies.id, candidate.id));
      });
      return res.json({
        status: "active",
        id: candidate.id,
        version: candidate.version,
      });
    },
  );
  app.post(
    "/api/discovery/policies/:id/rollback",
    attachUser,
    async (req, res) => {
      if (req.dbUser!.role !== "admin")
        return res
          .status(403)
          .json({ message: "Administrator access required" });
      const [target] = await db
        .select()
        .from(discoveryPolicies)
        .where(eq(discoveryPolicies.id, req.params.id))
        .limit(1);
      if (!target) return res.status(404).json({ message: "Policy not found" });
      await db.transaction(async (tx) => {
        await tx
          .update(discoveryPolicies)
          .set({ status: "rolled_back" })
          .where(
            and(
              eq(discoveryPolicies.key, target.key),
              eq(discoveryPolicies.status, "active"),
            ),
          );
        await tx
          .update(discoveryPolicies)
          .set({ status: "active", activatedAt: new Date() })
          .where(eq(discoveryPolicies.id, target.id));
      });
      return res.json({
        status: "active",
        id: target.id,
        version: target.version,
      });
    },
  );
  app.put("/api/discovery/moderation", attachUser, async (req, res) => {
    if (req.dbUser!.role !== "admin")
      return res.status(403).json({ message: "Administrator access required" });
    const parsed = contentModerationStateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message:
          parsed.error.issues[0]?.message ?? "Invalid moderation decision",
      });
    const [state] = await db
      .insert(contentModerationStates)
      .values({ ...parsed.data, decidedByUserId: req.dbUser!.id })
      .onConflictDoUpdate({
        target: [
          contentModerationStates.targetType,
          contentModerationStates.targetId,
        ],
        set: {
          visibility: parsed.data.visibility,
          sensitive: parsed.data.sensitive,
          reason: parsed.data.reason,
          decidedByUserId: req.dbUser!.id,
          decidedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return res.json(state);
  });
}
