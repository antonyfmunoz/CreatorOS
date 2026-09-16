import type { Express } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  contentResearchBriefSchema,
  contentResearchBriefUpdateSchema,
} from "@shared/content-research";
import {
  contentResearchBriefs,
  creativeWorkEvents,
  creativeWorkItems,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness } from "./businesses";
import { db } from "./db";
import { emitProjectionEvent } from "./umh";

async function ownedBrief(userId: number, id: string) {
  const [brief] = await db
    .select()
    .from(contentResearchBriefs)
    .where(
      and(
        eq(contentResearchBriefs.id, id),
        eq(contentResearchBriefs.ownerUserId, userId),
      ),
    )
    .limit(1);
  return brief ?? null;
}

export function registerContentResearchRoutes(app: Express) {
  app.get("/api/content-research", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const briefs = await db
      .select()
      .from(contentResearchBriefs)
      .where(
        and(
          eq(contentResearchBriefs.businessId, business.id),
          eq(contentResearchBriefs.ownerUserId, req.dbUser!.id),
        ),
      )
      .orderBy(desc(contentResearchBriefs.updatedAt));
    return res.json(briefs);
  });

  app.post("/api/content-research", attachUser, async (req, res) => {
    const parsed = contentResearchBriefSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid research brief",
      });
    }
    const business = await ensureDefaultBusiness(req.dbUser!);
    const { plannedFor, ...researchInput } = parsed.data;
    const [brief] = await db
      .insert(contentResearchBriefs)
      .values({
        businessId: business.id,
        ownerUserId: req.dbUser!.id,
        ...researchInput,
        plannedFor: plannedFor ? new Date(plannedFor) : null,
      })
      .returning();
    void emitProjectionEvent({
      aggregateType: "content_research_brief",
      aggregateId: brief.id,
      eventType: "content_research.created",
      actorUserId: req.dbUser!.id,
      payload: { businessId: business.id, topic: brief.topic },
      idempotencyKey: `content-research:${brief.id}:created`,
    }).catch((error) =>
      console.error("Failed to enqueue content research event:", error),
    );
    return res.status(201).json(brief);
  });

  app.patch("/api/content-research/:id", attachUser, async (req, res) => {
    const parsed = contentResearchBriefUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid research update",
      });
    }
    const brief = await ownedBrief(req.dbUser!.id, req.params.id);
    if (!brief) return res.status(404).json({ message: "Research brief not found" });
    const { plannedFor, ...researchUpdate } = parsed.data;
    const [updated] = await db
      .update(contentResearchBriefs)
      .set({
        ...researchUpdate,
        ...(plannedFor === undefined
          ? {}
          : { plannedFor: plannedFor ? new Date(plannedFor) : null }),
        updatedAt: new Date(),
      })
      .where(eq(contentResearchBriefs.id, brief.id))
      .returning();
    return res.json(updated);
  });

  app.post("/api/content-research/:id/plan", attachUser, async (req, res) => {
    const brief = await ownedBrief(req.dbUser!.id, req.params.id);
    if (!brief) return res.status(404).json({ message: "Research brief not found" });
    const [workItem] = await db
      .insert(creativeWorkItems)
      .values({
        businessId: brief.businessId,
        createdByUserId: req.dbUser!.id,
        title: brief.workingTitle || brief.topic,
        description: [brief.objective, brief.angle].filter(Boolean).join("\n\n"),
        kind: "content",
        status: "idea",
        priority: 60,
        dueAt: brief.plannedFor,
        sourceType: "content_research",
        sourceId: brief.id,
        metadata: { contentResearchBriefId: brief.id },
      })
      .onConflictDoUpdate({
        target: [
          creativeWorkItems.businessId,
          creativeWorkItems.sourceType,
          creativeWorkItems.sourceId,
        ],
        targetWhere: sql`${creativeWorkItems.sourceId} is not null`,
        set: {
          title: brief.workingTitle || brief.topic,
          description: [brief.objective, brief.angle].filter(Boolean).join("\n\n"),
          dueAt: brief.plannedFor,
          updatedAt: new Date(),
        },
      })
      .returning();
    await db.insert(creativeWorkEvents).values({
      workItemId: workItem.id,
      businessId: workItem.businessId,
      eventType: "content_research.planned",
      actorUserId: req.dbUser!.id,
      fromStatus: null,
      toStatus: workItem.status,
      version: workItem.version,
      payload: { contentResearchBriefId: brief.id },
      evidence: { source: "native" },
    });
    void emitProjectionEvent({
      aggregateType: "creative_work_item",
      aggregateId: workItem.id,
      eventType: "content_research.planned",
      actorUserId: req.dbUser!.id,
      payload: { businessId: workItem.businessId, contentResearchBriefId: brief.id },
      idempotencyKey: `content-research:${brief.id}:planned`,
    }).catch((error) =>
      console.error("Failed to enqueue research plan event:", error),
    );
    return res.status(201).json(workItem);
  });
}
