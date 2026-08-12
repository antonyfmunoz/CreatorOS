import type { Express } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { attachUser } from "./auth";
import { db } from "./db";
import { accountPrivacyRequests } from "@shared/schema";
import {
  accountDeletionBlockers,
  buildAccountExport,
  latestAccountDeletionRequest,
} from "./account-privacy";
import {
  accountDeletionConfirmation,
  accountDeletionRequestFingerprint,
  accountDeletionScheduledFor,
  canCancelAccountDeletion,
  validAccountDeletionConfirmation,
} from "./privacy-policy";

const scheduleSchema = z.object({ confirmation: z.string().min(1).max(160) });
const isDemoMode = () => process.env.CREATOROS_DEMO_MODE === "true";

export function registerAccountPrivacyRoutes(app: Express) {
  app.get("/api/privacy/summary", attachUser, async (req, res) => {
    if (isDemoMode()) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        accountStatus: req.dbUser!.status,
        exportSchemaVersion: "creativesos.account-export.v1",
        deletionGraceDays: 7,
        confirmation: accountDeletionConfirmation(req.dbUser!.username),
        blockers: [{
          kind: "demo_mode",
          id: "local-demo",
          name: "Local demonstration account",
          message: "Account deletion is disabled in the disposable local demo.",
        }],
        pendingRequest: null,
      });
    }
    const blockers = await accountDeletionBlockers(req.dbUser!.id);
    const pendingRequest = await latestAccountDeletionRequest(req.dbUser!.id);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      accountStatus: req.dbUser!.status,
      exportSchemaVersion: "creativesos.account-export.v1",
      deletionGraceDays: 7,
      confirmation: accountDeletionConfirmation(req.dbUser!.username),
      blockers,
      pendingRequest,
    });
  });

  app.get("/api/privacy/export", attachUser, async (req, res) => {
    const exportedAt = new Date();
    if (isDemoMode()) {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", `attachment; filename="creativesos-account-${exportedAt.toISOString().slice(0, 10)}.json"`);
      return res.json({
        schemaVersion: "creativesos.account-export.v1",
        exportedAt: exportedAt.toISOString(),
        account: req.dbUser,
        demo: true,
        privacyRequestId: "local-demo-export",
      });
    }
    const [request] = await db.insert(accountPrivacyRequests).values({
      userId: req.dbUser!.id,
      kind: "export",
      status: "completed",
      completedAt: exportedAt,
      metadata: { schemaVersion: "creativesos.account-export.v1" },
    }).returning();
    const payload = await buildAccountExport(req.dbUser!);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `attachment; filename="creativesos-account-${exportedAt.toISOString().slice(0, 10)}.json"`);
    res.json({ ...payload as Record<string, unknown>, privacyRequestId: request.id });
  });

  app.post("/api/privacy/deletion-requests", attachUser, async (req, res) => {
    if (isDemoMode()) {
      return res.status(409).json({ message: "Account deletion is disabled in the disposable local demo." });
    }
    const input = scheduleSchema.parse(req.body);
    if (!validAccountDeletionConfirmation(req.dbUser!.username, input.confirmation)) {
      return res.status(400).json({ message: `Type ${accountDeletionConfirmation(req.dbUser!.username)} exactly to continue.` });
    }
    const existing = await latestAccountDeletionRequest(req.dbUser!.id);
    if (existing) return res.status(409).json({ message: "An account deletion request is already active", request: existing });
    const blockers = await accountDeletionBlockers(req.dbUser!.id);
    if (blockers.length > 0) return res.status(409).json({ message: "Transfer ownership before deleting this account", blockers });
    const scheduledFor = accountDeletionScheduledFor();
    const [request] = await db.insert(accountPrivacyRequests).values({
      userId: req.dbUser!.id,
      kind: "deletion",
      status: "scheduled",
      scheduledFor,
      metadata: {
        fingerprint: accountDeletionRequestFingerprint(req.dbUser!.id, scheduledFor),
        graceDays: 7,
      },
    }).returning();
    res.status(202).json(request);
  });

  app.delete("/api/privacy/deletion-requests/:requestId", attachUser, async (req, res) => {
    if (isDemoMode()) {
      return res.status(404).json({ message: "Cancelable deletion request not found" });
    }
    const [request] = await db.select().from(accountPrivacyRequests).where(and(
      eq(accountPrivacyRequests.id, req.params.requestId),
      eq(accountPrivacyRequests.userId, req.dbUser!.id),
      eq(accountPrivacyRequests.kind, "deletion"),
      inArray(accountPrivacyRequests.status, ["scheduled", "blocked", "failed"]),
    )).orderBy(desc(accountPrivacyRequests.createdAt)).limit(1);
    if (!request) return res.status(404).json({ message: "Cancelable deletion request not found" });
    if (!canCancelAccountDeletion(request.status)) return res.status(409).json({ message: "This request can no longer be canceled" });
    const [canceled] = await db.update(accountPrivacyRequests).set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() }).where(eq(accountPrivacyRequests.id, request.id)).returning();
    res.json(canceled);
  });
}
