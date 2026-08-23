import type { Express } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  providerActivationDefinitions,
  providerActivationEvidenceInputSchema,
  providerActivationProviderIdSchema,
  providerActivationRunInputSchema,
  summarizeProviderActivationRun,
  type ProviderActivationProviderId,
} from "@shared/provider-activation";
import {
  providerActivationEvidence,
  providerActivationRuns,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness } from "./businesses";
import { db } from "./db";

const runIdSchema = z.string().uuid();
const RUN_HISTORY_LIMIT = 100;

async function currentEvidenceForRuns(runIds: string[]) {
  if (!runIds.length) return [];
  return db
    .selectDistinctOn([
      providerActivationEvidence.runId,
      providerActivationEvidence.stage,
    ])
    .from(providerActivationEvidence)
    .where(inArray(providerActivationEvidence.runId, runIds))
    .orderBy(
      providerActivationEvidence.runId,
      providerActivationEvidence.stage,
      desc(providerActivationEvidence.createdAt),
      desc(providerActivationEvidence.id),
    );
}

function serializeRun<Run extends { id: string; provider: string }>(
  run: Run,
  evidence: Awaited<ReturnType<typeof currentEvidenceForRuns>>,
) {
  const runEvidence = evidence.filter((item) => item.runId === run.id);
  return {
    ...run,
    evidence: runEvidence,
    qualification: summarizeProviderActivationRun(
      run.provider as ProviderActivationProviderId,
      runEvidence,
    ),
  };
}

export function registerProviderActivationRoutes(app: Express) {
  app.get("/api/provider-activations", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [recentRows, latestRows] = await Promise.all([
      db
        .select({ id: providerActivationRuns.id })
        .from(providerActivationRuns)
        .where(eq(providerActivationRuns.businessId, business.id))
        .orderBy(desc(providerActivationRuns.startedAt), desc(providerActivationRuns.id))
        .limit(RUN_HISTORY_LIMIT),
      db.execute(sql`
        select distinct on (provider, environment) id::text as id
        from provider_activation_runs
        where business_id = ${business.id}
        order by provider, environment, started_at desc, id desc
      `),
    ]);
    const latestIds = (Array.from(latestRows) as unknown as Array<{ id: string }>).map((row) => row.id);
    const runIds = Array.from(new Set([...recentRows.map((row) => row.id), ...latestIds]));
    const runs = await db
      .select()
      .from(providerActivationRuns)
      .where(and(eq(providerActivationRuns.businessId, business.id), inArray(providerActivationRuns.id, runIds.length ? runIds : ["00000000-0000-0000-0000-000000000000"])))
      .orderBy(desc(providerActivationRuns.startedAt), desc(providerActivationRuns.id));
    const evidence = await currentEvidenceForRuns(runs.map((run) => run.id));
    const serializedRuns = runs.map((run) => serializeRun(run, evidence));
    return res.json({
      definitions: providerActivationDefinitions.map((definition) => ({
        ...definition,
        latestRuns: (["sandbox", "staging", "production"] as const).flatMap((environment) => {
          const latest = serializedRuns.find((run) => run.provider === definition.id && run.environment === environment);
          return latest ? [latest] : [];
        }),
      })),
      runs: serializedRuns,
      guarantees: {
        appendOnlyEvidence: true,
        credentialsAccepted: false,
        qualificationRequiresEveryStage: true,
        tenantScoped: true,
        boundedDashboardHistory: true,
      },
      historyLimit: RUN_HISTORY_LIMIT,
    });
  });

  app.post("/api/provider-activations/:provider/runs", attachUser, async (req, res) => {
    const provider = providerActivationProviderIdSchema.safeParse(req.params.provider);
    const input = providerActivationRunInputSchema.safeParse(req.body);
    if (!provider.success || !input.success) {
      return res.status(400).json({
        message: "Invalid provider activation run",
        issues: [...(!provider.success ? provider.error.issues : []), ...(!input.success ? input.error.issues : [])],
      });
    }
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [run] = await db
      .insert(providerActivationRuns)
      .values({
        businessId: business.id,
        provider: provider.data,
        environment: input.data.environment,
        summary: input.data.summary,
        startedByUserId: req.dbUser!.id,
      })
      .returning();
    return res.status(201).json(serializeRun(run, []));
  });

  app.post("/api/provider-activations/runs/:runId/evidence", attachUser, async (req, res) => {
    const runId = runIdSchema.safeParse(req.params.runId);
    const input = providerActivationEvidenceInputSchema.safeParse(req.body);
    if (!runId.success || !input.success) {
      return res.status(400).json({
        message: "Invalid provider activation evidence",
        issues: [...(!runId.success ? runId.error.issues : []), ...(!input.success ? input.error.issues : [])],
      });
    }
    const business = await ensureDefaultBusiness(req.dbUser!);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${runId.data}, 0))`);
      const [run] = await tx
        .select()
        .from(providerActivationRuns)
        .where(and(eq(providerActivationRuns.id, runId.data), eq(providerActivationRuns.businessId, business.id)))
        .limit(1);
      if (!run) return { kind: "missing" as const };
      if (run.status !== "draft") return { kind: "closed" as const };
      const [recorded] = await tx
        .insert(providerActivationEvidence)
        .values({
          runId: run.id,
          businessId: business.id,
          stage: input.data.stage,
          outcome: input.data.outcome,
          evidenceUrl: input.data.evidenceUrl ?? null,
          summary: input.data.summary,
          observedAt: input.data.observedAt ?? new Date(),
          expiresAt: input.data.expiresAt ?? null,
          recordedByUserId: req.dbUser!.id,
        })
        .returning();
      const evidence = await tx
        .selectDistinctOn([providerActivationEvidence.stage])
        .from(providerActivationEvidence)
        .where(eq(providerActivationEvidence.runId, run.id))
        .orderBy(
          providerActivationEvidence.stage,
          desc(providerActivationEvidence.createdAt),
          desc(providerActivationEvidence.id),
        );
      return { kind: "recorded" as const, recorded, qualification: summarizeProviderActivationRun(run.provider as ProviderActivationProviderId, evidence) };
    });
    if (result.kind === "missing") return res.status(404).json({ message: "Provider activation run not found" });
    if (result.kind === "closed") return res.status(409).json({ message: "Only draft runs accept evidence" });
    return res.status(201).json({ evidence: result.recorded, qualification: result.qualification });
  });

  app.post("/api/provider-activations/runs/:runId/complete", attachUser, async (req, res) => {
    const runId = runIdSchema.safeParse(req.params.runId);
    if (!runId.success) return res.status(400).json({ message: "Invalid provider activation run id" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${runId.data}, 0))`);
      const [run] = await tx
        .select()
        .from(providerActivationRuns)
        .where(and(eq(providerActivationRuns.id, runId.data), eq(providerActivationRuns.businessId, business.id)))
        .limit(1);
      if (!run) return { kind: "missing" as const };
      if (run.status !== "draft") return { kind: "closed" as const, run };
      const evidence = await tx
        .selectDistinctOn([providerActivationEvidence.stage])
        .from(providerActivationEvidence)
        .where(eq(providerActivationEvidence.runId, run.id))
        .orderBy(
          providerActivationEvidence.stage,
          desc(providerActivationEvidence.createdAt),
          desc(providerActivationEvidence.id),
        );
      const qualification = summarizeProviderActivationRun(run.provider as ProviderActivationProviderId, evidence);
      if (!qualification.qualifiable) return { kind: "incomplete" as const, qualification };
      const [completed] = await tx
        .update(providerActivationRuns)
        .set({ status: "qualified", completedAt: new Date(), abandonedAt: null, closedByUserId: req.dbUser!.id, updatedAt: new Date() })
        .where(and(eq(providerActivationRuns.id, run.id), eq(providerActivationRuns.status, "draft")))
        .returning();
      return { kind: "completed" as const, run: completed, evidence, qualification };
    });
    if (result.kind === "missing") return res.status(404).json({ message: "Provider activation run not found" });
    if (result.kind === "closed") return res.status(409).json({ message: "Provider activation run is already closed", run: result.run });
    if (result.kind === "incomplete") return res.status(409).json({ message: "Every required stage needs current passing evidence", qualification: result.qualification });
    return res.json(serializeRun(result.run, result.evidence));
  });

  app.post("/api/provider-activations/runs/:runId/abandon", attachUser, async (req, res) => {
    const runId = runIdSchema.safeParse(req.params.runId);
    if (!runId.success) return res.status(400).json({ message: "Invalid provider activation run id" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const run = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${runId.data}, 0))`);
      const [updated] = await tx
        .update(providerActivationRuns)
        .set({ status: "abandoned", completedAt: null, abandonedAt: new Date(), closedByUserId: req.dbUser!.id, updatedAt: new Date() })
        .where(and(
          eq(providerActivationRuns.id, runId.data),
          eq(providerActivationRuns.businessId, business.id),
          eq(providerActivationRuns.status, "draft"),
        ))
        .returning();
      return updated;
    });
    if (!run) return res.status(404).json({ message: "Open provider activation run not found" });
    return res.json(run);
  });
}
