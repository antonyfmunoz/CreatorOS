import type { Express, NextFunction, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  errorBudget,
  operationalBudgetSchema,
  operationalServiceLevels,
  operationalServices,
  type OperationalService,
} from "@shared/operations";
import {
  businesses,
  operationalBudgets,
  operationalServiceEvents,
  operationalUsageEvents,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness } from "./businesses";
import { db } from "./db";

function serviceForPath(path: string): OperationalService | null {
  if (/^\/api\/(media|assets|playback|podcast)/.test(path)) return "playback";
  if (/^\/api\/(messages|relationship-hub)/.test(path)) return "messaging";
  if (/^\/api\/automations/.test(path)) return "automation";
  if (/^\/api\/(checkout|orders|stripe|products|marketplace)/.test(path)) return "commerce";
  if (/^\/api\/(community-rooms|broadcast)/.test(path)) return "realtime";
  if (/^\/api\/v1\//.test(path)) return "developer_api";
  if (/^\/api\/developer\/webhooks/.test(path)) return "webhooks";
  return null;
}

export async function recordOperationalServiceEvent(input: {
  businessId: string;
  service: OperationalService;
  success: boolean;
  durationMs: number;
  statusCode?: number | null;
  sourceType: string;
  sourceId: string;
  quantity?: number;
  unit?: string;
  estimatedCostMicros?: number;
}) {
  await db.transaction(async (tx) => {
    await tx
      .insert(operationalServiceEvents)
      .values({
        businessId: input.businessId,
        service: input.service,
        success: input.success,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        statusCode: input.statusCode ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      })
      .onConflictDoNothing();
    await tx
      .insert(operationalUsageEvents)
      .values({
        businessId: input.businessId,
        service: input.service,
        metric: "requests",
        quantity: Math.max(0, Math.round(input.quantity ?? 1)),
        unit: input.unit ?? "request",
        estimatedCostMicros: Math.max(0, Math.round(input.estimatedCostMicros ?? 0)),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      })
      .onConflictDoNothing();
  });
}

export function operationalRequestTelemetry(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const service = serviceForPath(req.path);
  if (!service) return next();
  const startedAt = performance.now();
  res.once("finish", () => {
    if (!req.dbUser) return;
    void (async () => {
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(and(eq(businesses.ownerUserId, req.dbUser!.id), eq(businesses.isDefault, true)))
        .limit(1);
      if (!business) return;
      await recordOperationalServiceEvent({
        businessId: business.id,
        service,
        success: res.statusCode < 500,
        durationMs: performance.now() - startedAt,
        statusCode: res.statusCode,
        sourceType: "http_request",
        sourceId: String(res.locals.requestId),
      });
    })().catch((error) => console.error("Operational telemetry write failed:", error));
  });
  next();
}

export function registerOperationsRoutes(app: Express) {
  app.get("/api/operations", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [observations, usage, budgets] = await Promise.all([
      db
        .select({
          service: operationalServiceEvents.service,
          total: sql<number>`count(*)::int`,
          failed: sql<number>`count(*) filter (where not ${operationalServiceEvents.success})::int`,
          p95Ms: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${operationalServiceEvents.durationMs}), 0)::int`,
        })
        .from(operationalServiceEvents)
        .where(and(eq(operationalServiceEvents.businessId, business.id), gte(operationalServiceEvents.occurredAt, since)))
        .groupBy(operationalServiceEvents.service),
      db
        .select({
          service: operationalUsageEvents.service,
          quantity: sql<number>`coalesce(sum(${operationalUsageEvents.quantity}), 0)::bigint`,
          estimatedCostMicros: sql<number>`coalesce(sum(${operationalUsageEvents.estimatedCostMicros}), 0)::bigint`,
        })
        .from(operationalUsageEvents)
        .where(and(eq(operationalUsageEvents.businessId, business.id), gte(operationalUsageEvents.occurredAt, monthStart)))
        .groupBy(operationalUsageEvents.service),
      db.select().from(operationalBudgets).where(eq(operationalBudgets.businessId, business.id)),
    ]);
    const observationByService = new Map(observations.map((row) => [row.service, row]));
    const usageByService = new Map(usage.map((row) => [row.service, row]));
    const budgetByService = new Map(budgets.map((row) => [row.service, row]));
    res.setHeader("Cache-Control", "no-store");
    res.json({
      windowDays: 30,
      services: operationalServiceLevels.map((objective) => {
        const observed = observationByService.get(objective.service) ?? { total: 0, failed: 0, p95Ms: 0 };
        const rawUsage = usageByService.get(objective.service) ?? { quantity: 0, estimatedCostMicros: 0 };
        const serviceUsage = {
          quantity: Number(rawUsage.quantity),
          estimatedCostMicros: Number(rawUsage.estimatedCostMicros),
        };
        const budget = budgetByService.get(objective.service) ?? null;
        return {
          ...objective,
          observed: {
            ...observed,
            availability: observed.total ? (observed.total - observed.failed) / observed.total : null,
            errorBudget: errorBudget({ total: observed.total, failed: observed.failed, targetAvailability: objective.targetAvailability }),
          },
          usage: serviceUsage,
          budget,
          budgetState: !budget?.enabled || !budget.hardLimitMicros
            ? "unbounded"
            : serviceUsage.estimatedCostMicros >= budget.hardLimitMicros
              ? "hard_limit"
              : serviceUsage.estimatedCostMicros >= budget.softLimitMicros
                ? "soft_limit"
                : "healthy",
        };
      }),
    });
  });

  app.put("/api/operations/budgets/:service", attachUser, async (req, res) => {
    const parsed = operationalBudgetSchema.safeParse({ ...req.body, service: req.params.service });
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid budget" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [budget] = await db
      .insert(operationalBudgets)
      .values({ businessId: business.id, ...parsed.data, updatedByUserId: req.dbUser!.id })
      .onConflictDoUpdate({
        target: [operationalBudgets.businessId, operationalBudgets.service],
        set: { ...parsed.data, updatedByUserId: req.dbUser!.id, updatedAt: new Date() },
      })
      .returning();
    res.json(budget);
  });

  if (process.env.CREATOROS_QUALIFICATION_MODE === "true")
    app.post("/api/qualification/operations/event", attachUser, async (req, res) => {
      const service = operationalServices.includes(req.body?.service) ? req.body.service : null;
      if (!service) return res.status(400).json({ message: "Invalid service" });
      const business = await ensureDefaultBusiness(req.dbUser!);
      await recordOperationalServiceEvent({
        businessId: business.id,
        service,
        success: req.body?.success !== false,
        durationMs: Number(req.body?.durationMs) || 0,
        statusCode: Number(req.body?.statusCode) || null,
        sourceType: "qualification",
        sourceId: String(req.body?.sourceId ?? crypto.randomUUID()),
        estimatedCostMicros: Number(req.body?.estimatedCostMicros) || 0,
      });
      res.status(201).json({ status: "recorded" });
    });
}
