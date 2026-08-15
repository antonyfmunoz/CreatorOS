import type { Express, NextFunction, Request, Response } from "express";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  communityLevelForPoints,
  completeCommunityOnboardingSchema,
  defaultCommunityBadges,
  replaceCommunityBadgesSchema,
  replaceCommunityOnboardingSchema,
  validateCommunityAnswer,
} from "@shared/community-engagement";
import {
  communityBadges,
  communityMemberBadges,
  communityMemberships,
  communityOnboardingQuestions,
  communityOnboardingResponses,
  communityPointEvents,
  notifications,
  users,
} from "@shared/schema";
import { attachUser } from "./auth";
import { db } from "./db";

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
const safe =
  (handler: Handler): Handler =>
  (req, res, next) => {
    try {
      Promise.resolve(handler(req, res, next)).catch(next);
    } catch (error) {
      next(error);
    }
  };

const dailyPointCaps: Record<string, number> = {
  message: 20,
  event_rsvp: 10,
  room_check_in: 30,
};

async function activeMembership(communityId: number, userId: number) {
  const [membership] = await db
    .select()
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
      ),
    )
    .limit(1);
  return membership ?? null;
}

async function grantEarnedBadges(communityId: number, userId: number) {
  const [totalRow] = await db
    .select({
      points: sql<number>`coalesce(sum(${communityPointEvents.points}), 0)`,
    })
    .from(communityPointEvents)
    .where(
      and(
        eq(communityPointEvents.communityId, communityId),
        eq(communityPointEvents.userId, userId),
      ),
    );
  const points = Number(totalRow?.points ?? 0);
  const eligible = await db
    .select()
    .from(communityBadges)
    .where(
      and(
        eq(communityBadges.communityId, communityId),
        eq(communityBadges.active, true),
        lte(communityBadges.pointsThreshold, points),
      ),
    );
  for (const badge of eligible) {
    const [awarded] = await db
      .insert(communityMemberBadges)
      .values({ communityId, userId, badgeId: badge.id })
      .onConflictDoNothing()
      .returning({ id: communityMemberBadges.id });
    if (awarded) {
      await db
        .insert(notifications)
        .values({
          userId,
          type: "community_badge",
          message: `You earned the ${badge.name} badge`,
          read: false,
          linkTo: `/communities/${communityId}`,
          sourceType: "community_badge",
          sourceId: awarded.id,
        })
        .onConflictDoNothing();
    }
  }
  return points;
}

export async function seedCommunityBadges(communityId: number) {
  await db
    .insert(communityBadges)
    .values(defaultCommunityBadges.map((badge) => ({ communityId, ...badge })))
    .onConflictDoNothing();
}

export async function awardCommunityPoints(input: {
  communityId: number;
  userId: number;
  sourceType: string;
  sourceId: string;
  points: number;
  reason: string;
}) {
  if (!(await activeMembership(input.communityId, input.userId))) return null;
  const cap = dailyPointCaps[input.sourceType];
  if (cap !== undefined) {
    // A rolling window is timezone-independent and closes the midnight reset
    // exploit that a calendar-day cap would create for globally distributed users.
    const start = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [today] = await db
      .select({
        points: sql<number>`coalesce(sum(${communityPointEvents.points}), 0)`,
      })
      .from(communityPointEvents)
      .where(
        and(
          eq(communityPointEvents.communityId, input.communityId),
          eq(communityPointEvents.userId, input.userId),
          eq(communityPointEvents.sourceType, input.sourceType),
          gte(communityPointEvents.createdAt, start),
        ),
      );
    if (Number(today?.points ?? 0) + input.points > cap) return null;
  }
  const [created] = await db
    .insert(communityPointEvents)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (!created) return null;
  const totalPoints = await grantEarnedBadges(input.communityId, input.userId);
  return { ...created, totalPoints, ...communityLevelForPoints(totalPoints) };
}

export function registerCommunityEngagementRoutes(app: Express) {
  app.get(
    "/api/communities/:id/onboarding",
    attachUser,
    safe(async (req, res) => {
      const communityId = Number(req.params.id);
      const membership = Number.isInteger(communityId)
        ? await activeMembership(communityId, req.dbUser!.id)
        : null;
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community to view onboarding" });
      const questions = await db
        .select()
        .from(communityOnboardingQuestions)
        .where(
          and(
            eq(communityOnboardingQuestions.communityId, communityId),
            eq(communityOnboardingQuestions.active, true),
          ),
        )
        .orderBy(asc(communityOnboardingQuestions.position));
      const responses = questions.length
        ? await db
            .select()
            .from(communityOnboardingResponses)
            .where(
              and(
                eq(communityOnboardingResponses.membershipId, membership.id),
                inArray(
                  communityOnboardingResponses.questionId,
                  questions.map((question) => question.id),
                ),
              ),
            )
        : [];
      const answered = new Set(
        responses.map((response) => response.questionId),
      );
      const requiredCount = questions.filter(
        (question) => question.required,
      ).length;
      const requiredAnsweredCount = questions.filter(
        (question) => question.required && answered.has(question.id),
      ).length;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        questions,
        responses,
        completedAt: membership.onboardingCompletedAt,
        complete:
          questions.length === 0 || Boolean(membership.onboardingCompletedAt),
        progress: {
          answeredCount: answered.size,
          totalCount: questions.length,
          requiredAnsweredCount,
          requiredCount,
        },
      });
    }),
  );

  app.put(
    "/api/communities/:id/onboarding/questions",
    attachUser,
    safe(async (req, res) => {
      const communityId = Number(req.params.id);
      const manager = Number.isInteger(communityId)
        ? await activeMembership(communityId, req.dbUser!.id)
        : null;
      if (!manager || !["owner", "admin"].includes(manager.role))
        return res
          .status(403)
          .json({ message: "Only community managers can edit onboarding" });
      const parsed = replaceCommunityOnboardingSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          message:
            parsed.error.issues[0]?.message ?? "Invalid onboarding questions",
        });
      const questions = await db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: communityOnboardingQuestions.id })
          .from(communityOnboardingQuestions)
          .where(eq(communityOnboardingQuestions.communityId, communityId));
        const existingIds = new Set(existing.map((question) => question.id));
        if (
          parsed.data.questions.some(
            (question) => question.id && !existingIds.has(question.id),
          )
        ) {
          throw new Error("QUESTION_SCOPE_MISMATCH");
        }
        await tx
          .update(communityOnboardingQuestions)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(communityOnboardingQuestions.communityId, communityId));
        const saved = [];
        for (
          let position = 0;
          position < parsed.data.questions.length;
          position += 1
        ) {
          const question = parsed.data.questions[position];
          if (question.id) {
            const [updated] = await tx
              .update(communityOnboardingQuestions)
              .set({
                ...question,
                position,
                active: true,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(communityOnboardingQuestions.id, question.id),
                  eq(communityOnboardingQuestions.communityId, communityId),
                ),
              )
              .returning();
            saved.push(updated);
          } else {
            const [created] = await tx
              .insert(communityOnboardingQuestions)
              .values({ communityId, ...question, position, active: true })
              .returning();
            saved.push(created);
          }
        }
        if (saved.length > 0) {
          await tx
            .update(communityMemberships)
            .set({ onboardingCompletedAt: null })
            .where(
              and(
                eq(communityMemberships.communityId, communityId),
                eq(communityMemberships.status, "active"),
                inArray(communityMemberships.role, ["member", "moderator"]),
              ),
            );
        }
        return saved;
      });
      res.json({ questions });
    }),
  );

  app.post(
    "/api/communities/:id/onboarding/complete",
    attachUser,
    safe(async (req, res) => {
      const communityId = Number(req.params.id);
      const membership = Number.isInteger(communityId)
        ? await activeMembership(communityId, req.dbUser!.id)
        : null;
      if (!membership)
        return res
          .status(403)
          .json({ message: "Join this community before onboarding" });
      const parsed = completeCommunityOnboardingSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({ message: "Provide valid onboarding answers" });
      const questions = await db
        .select()
        .from(communityOnboardingQuestions)
        .where(
          and(
            eq(communityOnboardingQuestions.communityId, communityId),
            eq(communityOnboardingQuestions.active, true),
          ),
        );
      const answerMap = new Map(
        parsed.data.answers.map((answer) => [answer.questionId, answer.value]),
      );
      if (answerMap.size !== parsed.data.answers.length)
        return res
          .status(400)
          .json({ message: "Each onboarding question can be answered once" });
      if (
        parsed.data.answers.some(
          (answer) =>
            !questions.some((question) => question.id === answer.questionId),
        )
      )
        return res
          .status(400)
          .json({
            message: "An answer does not belong to this onboarding flow",
          });
      const invalid = questions.find(
        (question) =>
          !validateCommunityAnswer(
            {
              kind: question.kind as "single_select" | "multi_select" | "text",
              options: question.options,
              required: question.required,
            },
            answerMap.get(question.id),
          ),
      );
      if (invalid)
        return res
          .status(400)
          .json({ message: `Answer required: ${invalid.prompt}` });
      await db.transaction(async (tx) => {
        for (const answer of parsed.data.answers) {
          await tx
            .insert(communityOnboardingResponses)
            .values({
              membershipId: membership.id,
              questionId: answer.questionId,
              answer: answer.value,
            })
            .onConflictDoUpdate({
              target: [
                communityOnboardingResponses.membershipId,
                communityOnboardingResponses.questionId,
              ],
              set: { answer: answer.value, updatedAt: new Date() },
            });
        }
        await tx
          .update(communityMemberships)
          .set({ onboardingCompletedAt: new Date() })
          .where(eq(communityMemberships.id, membership.id));
      });
      await awardCommunityPoints({
        communityId,
        userId: req.dbUser!.id,
        sourceType: "onboarding",
        sourceId: String(membership.id),
        points: 25,
        reason: "Completed community onboarding",
      });
      res.json({ complete: true, completedAt: new Date().toISOString() });
    }),
  );

  app.get(
    "/api/communities/:id/leaderboard",
    attachUser,
    safe(async (req, res) => {
      const communityId = Number(req.params.id);
      if (
        !Number.isInteger(communityId) ||
        !(await activeMembership(communityId, req.dbUser!.id))
      )
        return res
          .status(403)
          .json({ message: "Join this community to view its leaderboard" });
      const rows = await db
        .select({
          userId: users.id,
          username: users.username,
          displayName: users.displayName,
          profileImageUrl: users.profileImageUrl,
          points: sql<number>`coalesce(sum(${communityPointEvents.points}), 0)`,
        })
        .from(communityMemberships)
        .innerJoin(users, eq(users.id, communityMemberships.userId))
        .leftJoin(
          communityPointEvents,
          and(
            eq(
              communityPointEvents.communityId,
              communityMemberships.communityId,
            ),
            eq(communityPointEvents.userId, communityMemberships.userId),
          ),
        )
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.status, "active"),
          ),
        )
        .groupBy(
          users.id,
          users.username,
          users.displayName,
          users.profileImageUrl,
        )
        .orderBy(
          desc(sql`coalesce(sum(${communityPointEvents.points}), 0)`),
          asc(users.id),
        );
      const badgeRows = rows.length
        ? await db
            .select({
              userId: communityMemberBadges.userId,
              id: communityBadges.id,
              name: communityBadges.name,
              description: communityBadges.description,
              icon: communityBadges.icon,
              awardedAt: communityMemberBadges.awardedAt,
            })
            .from(communityMemberBadges)
            .innerJoin(
              communityBadges,
              eq(communityBadges.id, communityMemberBadges.badgeId),
            )
            .where(
              and(
                eq(communityMemberBadges.communityId, communityId),
                inArray(
                  communityMemberBadges.userId,
                  rows.map((row) => row.userId),
                ),
              ),
            )
        : [];
      const entries = rows.map((row, index) => {
        const points = Number(row.points);
        return {
          ...row,
          points,
          rank: index + 1,
          ...communityLevelForPoints(points),
          badges: badgeRows.filter((badge) => badge.userId === row.userId),
        };
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({
        entries: entries.slice(0, 100),
        current:
          entries.find((entry) => entry.userId === req.dbUser!.id) ?? null,
      });
    }),
  );

  app.put(
    "/api/communities/:id/badges",
    attachUser,
    safe(async (req, res) => {
      const communityId = Number(req.params.id);
      const manager = Number.isInteger(communityId)
        ? await activeMembership(communityId, req.dbUser!.id)
        : null;
      if (!manager || !["owner", "admin"].includes(manager.role))
        return res
          .status(403)
          .json({ message: "Only community managers can edit badges" });
      const parsed = replaceCommunityBadgesSchema.safeParse(req.body);
      if (!parsed.success)
        return res
          .status(400)
          .json({
            message: parsed.error.issues[0]?.message ?? "Invalid badges",
          });
      await db.transaction(async (tx) => {
        await tx
          .update(communityBadges)
          .set({ active: false })
          .where(eq(communityBadges.communityId, communityId));
        for (const badge of parsed.data.badges) {
          await tx
            .insert(communityBadges)
            .values({ communityId, ...badge, active: true })
            .onConflictDoUpdate({
              target: [communityBadges.communityId, communityBadges.name],
              set: { ...badge, active: true },
            });
        }
      });
      const badges = await db
        .select()
        .from(communityBadges)
        .where(
          and(
            eq(communityBadges.communityId, communityId),
            eq(communityBadges.active, true),
          ),
        )
        .orderBy(asc(communityBadges.pointsThreshold));
      res.json({ badges });
    }),
  );
}
