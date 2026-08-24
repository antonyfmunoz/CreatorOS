import type { Express } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { canTransitionCreativeWork, createChannelVariantsSchema, createCreativeWorkItemSchema, recoverMissedWorkSchema, updateCreativeWorkItemSchema } from "@shared/planning";
import {
  broadcastSessions,
  broadcastStudios,
  campaignDeliverables,
  campaigns,
  creativeWorkApprovals,
  creativeWorkDependencies,
  creativeWorkItems,
  cutStudioJobs,
  cutStudioProjects,
  distributionJobs,
  events,
  ugcCollaborations,
  ugcOpportunities,
  ugcSubmissions,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";

async function ownedItem(userId: number, id: string) { const [item] = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.id, id)).limit(1); return item && await userCanManageBusiness(userId, item.businessId) ? item : null; }

async function syncPlanningSources(userId: number, businessId: string) {
  const [campaignRows, deliverableRows, distributionRows, cutRows, cutJobRows, broadcastRows, eventRows, ugcRows, ugcSubmissionRows] = await Promise.all([
    db.select().from(campaigns).where(eq(campaigns.businessId, businessId)),
    db.select({ deliverable: campaignDeliverables, campaign: campaigns }).from(campaignDeliverables).innerJoin(campaigns, eq(campaignDeliverables.campaignId, campaigns.id)).where(eq(campaigns.businessId, businessId)),
    db.select().from(distributionJobs).where(eq(distributionJobs.userId, userId)).orderBy(desc(distributionJobs.createdAt)).limit(500),
    db.select().from(cutStudioProjects).where(eq(cutStudioProjects.businessId, businessId)).orderBy(desc(cutStudioProjects.updatedAt)).limit(500),
    db.select({ job: cutStudioJobs, project: cutStudioProjects }).from(cutStudioJobs).innerJoin(cutStudioProjects, eq(cutStudioJobs.projectId, cutStudioProjects.id)).where(eq(cutStudioProjects.businessId, businessId)).orderBy(desc(cutStudioJobs.createdAt)).limit(500),
    db.select({ session: broadcastSessions, studio: broadcastStudios }).from(broadcastSessions).innerJoin(broadcastStudios, eq(broadcastSessions.studioId, broadcastStudios.id)).where(eq(broadcastSessions.businessId, businessId)).orderBy(desc(broadcastSessions.createdAt)).limit(500),
    db.select().from(events).where(eq(events.userId, userId)).orderBy(desc(events.dateTime)).limit(500),
    db.select({ collaboration: ugcCollaborations, opportunity: ugcOpportunities }).from(ugcCollaborations).innerJoin(ugcOpportunities, eq(ugcCollaborations.opportunityId, ugcOpportunities.id)).where(eq(ugcCollaborations.businessId, businessId)).orderBy(desc(ugcCollaborations.updatedAt)).limit(500),
    db.select({ submission: ugcSubmissions, collaboration: ugcCollaborations, opportunity: ugcOpportunities }).from(ugcSubmissions).innerJoin(ugcCollaborations, eq(ugcSubmissions.collaborationId, ugcCollaborations.id)).innerJoin(ugcOpportunities, eq(ugcCollaborations.opportunityId, ugcOpportunities.id)).where(eq(ugcCollaborations.businessId, businessId)).orderBy(desc(ugcSubmissions.updatedAt)).limit(500),
  ]);
  const values: Array<typeof creativeWorkItems.$inferInsert> = [
    ...campaignRows.map((row) => ({ businessId, createdByUserId: userId, title: row.name, description: row.description, kind: "campaign", status: row.status === "completed" ? "retrospective" : row.status === "active" ? "production" : "brief", startsAt: row.startsAt, dueAt: row.endsAt, sourceType: "campaign", sourceId: row.id, metadata: { objective: row.objective, channel: row.channel } })),
    ...deliverableRows.map(({ deliverable, campaign }) => ({ businessId, createdByUserId: userId, title: deliverable.title, description: deliverable.notes, kind: "content", status: deliverable.status === "published" ? "published" : deliverable.status === "approved" ? "scheduled" : deliverable.status === "in_review" ? "review" : deliverable.status === "in_progress" ? "production" : "brief", dueAt: deliverable.dueAt, channel: deliverable.channel, sourceType: "campaign_deliverable", sourceId: deliverable.id, metadata: { campaignId: campaign.id, campaignName: campaign.name } })),
    ...distributionRows.map((row) => ({ businessId, createdByUserId: userId, title: row.content.slice(0, 120), kind: "distribution", status: row.status === "published" ? "published" : row.status === "canceled" ? "cancelled" : row.status === "failed" ? "blocked" : "scheduled", startsAt: row.scheduledFor, dueAt: row.scheduledFor, channel: row.platforms.join(", "), sourceType: "distribution", sourceId: row.id, metadata: { platforms: row.platforms } })),
    ...cutRows.map((row) => ({ businessId, createdByUserId: userId, title: row.name, kind: "cut", status: row.status === "archived" ? "retrospective" : "edit", sourceType: "cut_project", sourceId: row.id, metadata: { mediaKind: row.mediaKind, revision: row.revision } })),
    ...cutJobRows.map(({ job, project }) => ({ businessId, createdByUserId: userId, title: `${project.name}: ${job.kind}`, description: job.detail, kind: "cut", status: job.state === "succeeded" ? "review" : job.state === "failed" || job.state === "cancelled" ? "blocked" : "edit", startsAt: job.startedAt ?? job.createdAt, dueAt: job.finishedAt, sourceType: "cut_job", sourceId: job.id, metadata: { projectId: project.id, progress: job.progress, errorCode: job.errorCode } })),
    ...broadcastRows.map(({ session, studio }) => ({ businessId, createdByUserId: userId, title: `${studio.name} broadcast`, kind: "broadcast", status: session.state === "ended" ? "retrospective" : session.state === "failed" ? "blocked" : session.state === "live" ? "production" : "scheduled", startsAt: session.startedAt ?? session.createdAt, dueAt: session.endedAt, sourceType: "broadcast_session", sourceId: session.id, metadata: { studioId: studio.id, outputMode: session.outputMode, health: session.health } })),
    ...eventRows.map((row) => ({ businessId, createdByUserId: userId, title: row.name, description: row.description, kind: "event", status: row.dateTime.getTime() < Date.now() ? "retrospective" : "scheduled", startsAt: row.dateTime, dueAt: row.dateTime, channel: row.location, sourceType: "event", sourceId: String(row.id), metadata: { communityId: row.communityId, channelId: row.channelId } })),
    ...ugcRows.map(({ collaboration, opportunity }) => ({ businessId, createdByUserId: userId, assigneeUserId: collaboration.creatorUserId, title: opportunity.title, description: opportunity.description, kind: "ugc", status: collaboration.status === "completed" ? "retrospective" : collaboration.status === "approved" ? "scheduled" : collaboration.status === "cancelled" ? "cancelled" : "production", dueAt: opportunity.contentDueAt, sourceType: "ugc_collaboration", sourceId: collaboration.id, metadata: { opportunityId: opportunity.id, compensation: collaboration.compensation } })),
    ...ugcSubmissionRows.map(({ submission, collaboration, opportunity }) => ({ businessId, createdByUserId: userId, assigneeUserId: submission.creatorUserId, title: `${opportunity.title} v${submission.version}`, description: submission.notes, kind: "ugc", status: submission.status === "approved" ? "published" : submission.status === "changes_requested" || submission.status === "rejected" ? "blocked" : "review", dueAt: opportunity.contentDueAt, sourceType: "ugc_submission", sourceId: submission.id, metadata: { collaborationId: collaboration.id, assetId: submission.assetId } })),
  ];
  for (const value of values) {
    await db.insert(creativeWorkItems).values(value).onConflictDoUpdate({
      target: [creativeWorkItems.businessId, creativeWorkItems.sourceType, creativeWorkItems.sourceId],
      targetWhere: sql`${creativeWorkItems.sourceId} is not null`,
      set: { title: value.title, description: value.description ?? "", kind: value.kind, status: value.status, assigneeUserId: value.assigneeUserId ?? null, channel: value.channel ?? null, startsAt: value.startsAt ?? null, dueAt: value.dueAt ?? null, metadata: value.metadata, updatedAt: new Date() },
    });
  }
}

async function dependencyWouldCycle(businessId: string, itemId: string, dependsOnId: string) {
  const ids = (await db.select({ id: creativeWorkItems.id }).from(creativeWorkItems).where(eq(creativeWorkItems.businessId, businessId))).map((row) => row.id);
  if (!ids.length) return false;
  const edges = await db.select({ from: creativeWorkDependencies.workItemId, to: creativeWorkDependencies.dependsOnWorkItemId }).from(creativeWorkDependencies).where(inArray(creativeWorkDependencies.workItemId, ids));
  const graph = new Map<string, string[]>();
  for (const edge of edges) graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to]);
  graph.set(itemId, [...(graph.get(itemId) ?? []), dependsOnId]);
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const next of graph.get(id) ?? []) if (visit(next)) return true; visiting.delete(id); visited.add(id); return false; };
  return visit(itemId);
}

function advanceRecurringDate(date: Date | null, frequency: "daily" | "weekly" | "monthly", interval: number, position: number) {
  if (!date) return null;
  const next = new Date(date);
  if (frequency === "daily") next.setUTCDate(next.getUTCDate() + interval * position);
  if (frequency === "weekly") next.setUTCDate(next.getUTCDate() + interval * 7 * position);
  if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + interval * position);
  return next;
}

export function registerPlanningRoutes(app: Express) {
  app.get("/api/planning/calendar", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!); await syncPlanningSources(req.dbUser!.id, business.id);
    const items = await db.select().from(creativeWorkItems).where(eq(creativeWorkItems.businessId, business.id)).orderBy(asc(creativeWorkItems.dueAt), desc(creativeWorkItems.priority));
    const ids = items.map((item) => item.id);
    const [dependencies, approvals] = ids.length ? await Promise.all([db.select().from(creativeWorkDependencies).where(inArray(creativeWorkDependencies.workItemId, ids)), db.select().from(creativeWorkApprovals).where(inArray(creativeWorkApprovals.workItemId, ids)).orderBy(desc(creativeWorkApprovals.requestedAt))]) : [[], []];
    const now = Date.now(); return res.json(items.map((item) => ({ ...item, dependencies: dependencies.filter((row) => row.workItemId === item.id), approvals: approvals.filter((row) => row.workItemId === item.id), missed: Boolean(item.dueAt && item.dueAt.getTime() < now && !["published", "retrospective", "cancelled"].includes(item.status)) })));
  });

  app.post("/api/planning/items", attachUser, async (req, res) => {
    const parsed = createCreativeWorkItemSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid work item" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const result = await db.transaction(async (tx) => {
      const [item] = await tx.insert(creativeWorkItems).values({ ...parsed.data, businessId: business.id, createdByUserId: req.dbUser!.id }).returning();
      const recurrence = parsed.data.recurrence;
      const instances = "frequency" in recurrence ? Array.from({ length: recurrence.occurrences - 1 }, (_, index) => ({
        ...parsed.data,
        title: `${parsed.data.title} · ${index + 2}`,
        businessId: business.id,
        createdByUserId: req.dbUser!.id,
        startsAt: advanceRecurringDate(parsed.data.startsAt, recurrence.frequency, recurrence.interval, index + 1),
        dueAt: advanceRecurringDate(parsed.data.dueAt, recurrence.frequency, recurrence.interval, index + 1),
        sourceType: "recurrence",
        sourceId: `${item.id}:${index + 2}`,
        metadata: { ...parsed.data.metadata, recurringParentId: item.id, occurrence: index + 2 },
      })) : [];
      if (instances.length) await tx.insert(creativeWorkItems).values(instances);
      return { item, generatedOccurrences: instances.length };
    });
    return res.status(201).json({ ...result.item, generatedOccurrences: result.generatedOccurrences });
  });

  app.patch("/api/planning/items/:id", attachUser, async (req, res) => {
    const parsed = updateCreativeWorkItemSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid update" });
    const item = await ownedItem(req.dbUser!.id, req.params.id); if (!item) return res.status(404).json({ message: "Work item not found" });
    const startsAt = parsed.data.startsAt === undefined ? item.startsAt : parsed.data.startsAt; const dueAt = parsed.data.dueAt === undefined ? item.dueAt : parsed.data.dueAt;
    if (startsAt && dueAt && dueAt < startsAt) return res.status(400).json({ message: "Due date cannot precede the start date" });
    const [updated] = await db.update(creativeWorkItems).set({ ...parsed.data, version: sql`${creativeWorkItems.version} + 1`, updatedAt: new Date() }).where(and(eq(creativeWorkItems.id, item.id), eq(creativeWorkItems.version, parsed.data.version))).returning();
    if (!updated) return res.status(409).json({ message: "This work item changed; refresh before saving" }); return res.json(updated);
  });

  app.post("/api/planning/items/:id/status", attachUser, async (req, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status : ""; const item = await ownedItem(req.dbUser!.id, req.params.id); if (!item) return res.status(404).json({ message: "Work item not found" });
    if (item.sourceType === "benchmark_remediation" && !["brief", "production", "review", "blocked"].includes(status)) return res.status(409).json({ message: "A benchmark remediation can close only after a passing locked retest" });
    if (!canTransitionCreativeWork(item.status, status)) return res.status(409).json({ message: `Cannot move ${item.status} work directly to ${status}` });
    if (["scheduled", "published"].includes(status)) { const deps = await db.select({ state: creativeWorkItems.status }).from(creativeWorkDependencies).innerJoin(creativeWorkItems, eq(creativeWorkDependencies.dependsOnWorkItemId, creativeWorkItems.id)).where(eq(creativeWorkDependencies.workItemId, item.id)); if (deps.some((dep) => !["published", "retrospective"].includes(dep.state))) return res.status(409).json({ message: "Complete dependent work before scheduling or publishing" }); const [latestApproval] = await db.select().from(creativeWorkApprovals).where(eq(creativeWorkApprovals.workItemId, item.id)).orderBy(desc(creativeWorkApprovals.requestedAt)).limit(1); if (latestApproval && latestApproval.status !== "approved") return res.status(409).json({ message: latestApproval.status === "pending" ? "Approval is still pending" : "Requested changes must be resolved and approved" }); }
    const [updated] = await db.update(creativeWorkItems).set({ status, completedAt: ["published", "retrospective", "cancelled"].includes(status) ? new Date() : null, version: sql`${creativeWorkItems.version} + 1`, updatedAt: new Date() }).where(and(eq(creativeWorkItems.id, item.id), eq(creativeWorkItems.status, item.status))).returning(); return res.json(updated);
  });

  app.post("/api/planning/items/:id/dependencies", attachUser, async (req, res) => { const item = await ownedItem(req.dbUser!.id, req.params.id); const dependency = typeof req.body?.dependsOnWorkItemId === "string" ? await ownedItem(req.dbUser!.id, req.body.dependsOnWorkItemId) : null; if (!item || !dependency) return res.status(404).json({ message: "Both work items are required" }); if (item.id === dependency.id) return res.status(400).json({ message: "Work cannot depend on itself" }); if (await dependencyWouldCycle(item.businessId, item.id, dependency.id)) return res.status(409).json({ message: "This dependency would create a cycle" }); const [row] = await db.insert(creativeWorkDependencies).values({ workItemId: item.id, dependsOnWorkItemId: dependency.id, createdByUserId: req.dbUser!.id }).onConflictDoNothing().returning(); return res.status(row ? 201 : 200).json(row ?? { status: "already_exists" }); });

  app.post("/api/planning/items/:id/approvals", attachUser, async (req, res) => { const item = await ownedItem(req.dbUser!.id, req.params.id); if (!item) return res.status(404).json({ message: "Work item not found" }); const [approval] = await db.insert(creativeWorkApprovals).values({ workItemId: item.id, requestedByUserId: req.dbUser!.id, reviewerUserId: Number.isInteger(req.body?.reviewerUserId) ? req.body.reviewerUserId : null, note: typeof req.body?.note === "string" ? req.body.note.slice(0, 2_000) : "" }).onConflictDoNothing().returning(); return res.status(approval ? 201 : 200).json(approval ?? { status: "already_pending" }); });
  app.post("/api/planning/approvals/:id/decide", attachUser, async (req, res) => { const decision = typeof req.body?.status === "string" ? req.body.status : ""; if (!["approved", "changes_requested"].includes(decision)) return res.status(400).json({ message: "Choose approve or request changes" }); const [approval] = await db.select().from(creativeWorkApprovals).where(eq(creativeWorkApprovals.id, req.params.id)).limit(1); const item = approval ? await ownedItem(req.dbUser!.id, approval.workItemId) : null; if (!approval || !item || approval.status !== "pending") return res.status(404).json({ message: "Pending approval not found" }); const [updated] = await db.update(creativeWorkApprovals).set({ status: decision, reviewerUserId: req.dbUser!.id, note: typeof req.body?.note === "string" ? req.body.note.slice(0, 2_000) : approval.note, decidedAt: new Date() }).where(and(eq(creativeWorkApprovals.id, approval.id), eq(creativeWorkApprovals.status, "pending"))).returning(); return res.json(updated); });

  app.post("/api/planning/items/:id/variants", attachUser, async (req, res) => {
    const parsed = createChannelVariantsSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid channel variants" });
    const item = await ownedItem(req.dbUser!.id, req.params.id); if (!item) return res.status(404).json({ message: "Work item not found" });
    const variants = await db.insert(creativeWorkItems).values(parsed.data.variants.map((variant) => ({ businessId: item.businessId, createdByUserId: req.dbUser!.id, assigneeUserId: item.assigneeUserId, title: variant.title ?? `${item.title} · ${variant.channel}`, description: item.description, kind: item.kind, status: item.status, priority: item.priority, channel: variant.channel, startsAt: item.startsAt, dueAt: variant.dueAt ?? item.dueAt, sourceType: "channel_variant", sourceId: `${item.id}:${variant.channel.toLowerCase()}`, metadata: { ...item.metadata, variantOfWorkItemId: item.id } }))).onConflictDoNothing().returning();
    return res.status(201).json({ created: variants.length, variants });
  });

  app.post("/api/planning/items/:id/recover", attachUser, async (req, res) => {
    const parsed = recoverMissedWorkSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid recovery action" });
    const item = await ownedItem(req.dbUser!.id, req.params.id); if (!item) return res.status(404).json({ message: "Work item not found" });
    if (!item.dueAt || item.dueAt.getTime() >= Date.now() || ["published", "retrospective", "cancelled"].includes(item.status)) return res.status(409).json({ message: "Only missed work can be recovered" });
    const recovery = { action: parsed.data.action, note: parsed.data.note, recoveredAt: new Date().toISOString(), previousDueAt: item.dueAt.toISOString() };
    const [updated] = await db.update(creativeWorkItems).set(parsed.data.action === "cancel" ? { status: "cancelled", completedAt: new Date(), metadata: { ...item.metadata, recovery }, version: sql`${creativeWorkItems.version} + 1`, updatedAt: new Date() } : { dueAt: parsed.data.dueAt, status: item.status === "blocked" ? "review" : item.status, metadata: { ...item.metadata, recovery }, version: sql`${creativeWorkItems.version} + 1`, updatedAt: new Date() }).where(and(eq(creativeWorkItems.id, item.id), eq(creativeWorkItems.version, item.version))).returning();
    return res.json(updated);
  });
}
