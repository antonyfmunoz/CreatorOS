import crypto from "node:crypto";
import type { Express, Request } from "express";
import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { cutLocalNodeClaimSchema, cutLocalNodeHeartbeatSchema } from "@shared/cut-node";
import { cutStudioLocalNodeInvitations, cutStudioLocalNodes } from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness } from "./businesses";
import { db } from "./db";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const safe = (node: typeof cutStudioLocalNodes.$inferSelect) => { const { deviceSecretHash: _secret, ...value } = node; return value; };
async function authenticated(req: Request) {
  const token = req.header("authorization")?.match(/^Bearer\s+([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (!token) return null;
  const [node] = await db.select().from(cutStudioLocalNodes).where(and(eq(cutStudioLocalNodes.deviceSecretHash, hash(token)), isNull(cutStudioLocalNodes.revokedAt))).limit(1);
  return node ?? null;
}

export function registerCutLocalNodeRoutes(app: Express) {
  app.get("/api/cut/nodes", attachUser, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const nodes = await db.select().from(cutStudioLocalNodes).where(eq(cutStudioLocalNodes.ownerUserId, req.dbUser!.id)).orderBy(desc(cutStudioLocalNodes.updatedAt));
    res.json({ nodes: nodes.map(safe) });
  });
  app.post("/api/cut/nodes/invitations", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!.id);
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await db.transaction(async tx => {
      await tx.delete(cutStudioLocalNodeInvitations).where(and(eq(cutStudioLocalNodeInvitations.ownerUserId, req.dbUser!.id), lt(cutStudioLocalNodeInvitations.expiresAt, new Date())));
      await tx.insert(cutStudioLocalNodeInvitations).values({ ownerUserId: req.dbUser!.id, businessId: business.id, tokenHash: hash(token), expiresAt });
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.status(201).json({ token, expiresAt });
  });
  app.post("/api/cut/nodes/claim", async (req, res) => {
    const parsed = cutLocalNodeClaimSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid local node claim" });
    const now = new Date(); const secret = crypto.randomBytes(32).toString("base64url");
    const node = await db.transaction(async tx => {
      const [invite] = await tx.select().from(cutStudioLocalNodeInvitations).where(and(eq(cutStudioLocalNodeInvitations.tokenHash, hash(parsed.data.token)), isNull(cutStudioLocalNodeInvitations.consumedAt), gt(cutStudioLocalNodeInvitations.expiresAt, now))).limit(1);
      if (!invite) return null;
      const consumed = await tx.update(cutStudioLocalNodeInvitations).set({ consumedAt: now }).where(and(eq(cutStudioLocalNodeInvitations.id, invite.id), isNull(cutStudioLocalNodeInvitations.consumedAt))).returning({ id: cutStudioLocalNodeInvitations.id });
      if (!consumed.length) return null;
      const [created] = await tx.insert(cutStudioLocalNodes).values({ ownerUserId: invite.ownerUserId, businessId: invite.businessId, name: parsed.data.name, capabilities: parsed.data.capabilities, deviceSecretHash: hash(secret), lastSeenAt: now }).returning();
      return created;
    });
    if (!node) return res.status(410).json({ message: "This pairing code is invalid, expired, or already used" });
    res.setHeader("Cache-Control", "no-store"); res.status(201).json({ node: safe(node), credential: secret });
  });
  app.post("/api/cut/nodes/:id/heartbeat", async (req, res) => {
    const node = await authenticated(req); if (!node || node.id !== req.params.id) return res.status(401).json({ message: "Local-node authentication failed" });
    const parsed = cutLocalNodeHeartbeatSchema.safeParse(req.body ?? {}); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const [updated] = await db.update(cutStudioLocalNodes).set({ status: parsed.data.status, lastSequence: parsed.data.sequence, lastSeenAt: new Date(), updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, node.id), lt(cutStudioLocalNodes.lastSequence, parsed.data.sequence), isNull(cutStudioLocalNodes.revokedAt))).returning();
    if (!updated) return res.status(409).json({ message: "A newer node heartbeat was already accepted" }); res.json({ node: safe(updated) });
  });
  app.delete("/api/cut/nodes/:id", attachUser, async (req, res) => {
    const [node] = await db.update(cutStudioLocalNodes).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(cutStudioLocalNodes.id, req.params.id), eq(cutStudioLocalNodes.ownerUserId, req.dbUser!.id), isNull(cutStudioLocalNodes.revokedAt))).returning();
    if (!node) return res.status(404).json({ message: "Local node not found" }); res.status(204).end();
  });
}
