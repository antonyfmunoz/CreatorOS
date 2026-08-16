import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import {
  mobileInstallationIdSchema,
  registerMobileDeviceSchema,
} from "@shared/mobile";
import { mobileDeviceRegistrations } from "@shared/schema";
import { attachUser } from "./auth";
import { db } from "./db";
import { encryptSensitiveValue } from "./sensitive-data";

const deviceWriteLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const safe = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  try {
    Promise.resolve(handler(req, res, next)).catch(next);
  } catch (error) {
    next(error);
  }
};

const publicDeviceFields = {
  id: mobileDeviceRegistrations.id,
  installationId: mobileDeviceRegistrations.installationId,
  platform: mobileDeviceRegistrations.platform,
  provider: mobileDeviceRegistrations.pushProvider,
  appVersion: mobileDeviceRegistrations.appVersion,
  status: mobileDeviceRegistrations.status,
  lastSeenAt: mobileDeviceRegistrations.lastSeenAt,
  createdAt: mobileDeviceRegistrations.createdAt,
  updatedAt: mobileDeviceRegistrations.updatedAt,
};

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function registerMobileRoutes(app: Express) {
  app.get("/api/mobile/devices", attachUser, safe(async (req, res) => {
    const devices = await db
      .select(publicDeviceFields)
      .from(mobileDeviceRegistrations)
      .where(eq(mobileDeviceRegistrations.userId, req.dbUser!.id))
      .orderBy(desc(mobileDeviceRegistrations.updatedAt));
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({ devices });
  }));

  app.post("/api/mobile/devices", attachUser, deviceWriteLimit, safe(async (req, res) => {
    const parsed = registerMobileDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid mobile device registration",
      });
    }

    const now = new Date();
    const hash = tokenHash(parsed.data.pushToken);
    const ciphertext = encryptSensitiveValue(parsed.data.pushToken);

    // A provider token belongs to one installation. Revoke any stale owner
    // before the owner-scoped upsert so account changes cannot cross-deliver.
    await db
      .update(mobileDeviceRegistrations)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(mobileDeviceRegistrations.pushTokenHash, hash),
          eq(mobileDeviceRegistrations.status, "active"),
        ),
      );

    const [device] = await db
      .insert(mobileDeviceRegistrations)
      .values({
        userId: req.dbUser!.id,
        installationId: parsed.data.installationId,
        platform: parsed.data.platform,
        pushProvider: parsed.data.provider,
        pushTokenHash: hash,
        pushTokenCiphertext: ciphertext,
        appVersion: parsed.data.appVersion ?? null,
        status: "active",
        lastSeenAt: now,
        updatedAt: now,
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: [
          mobileDeviceRegistrations.userId,
          mobileDeviceRegistrations.installationId,
        ],
        set: {
          platform: parsed.data.platform,
          pushProvider: parsed.data.provider,
          pushTokenHash: hash,
          pushTokenCiphertext: ciphertext,
          appVersion: parsed.data.appVersion ?? null,
          status: "active",
          lastSeenAt: now,
          updatedAt: now,
          revokedAt: null,
        },
      })
      .returning(publicDeviceFields);

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(201).json({ device });
  }));

  app.delete(
    "/api/mobile/devices/:installationId",
    attachUser,
    deviceWriteLimit,
    safe(async (req, res) => {
      const installationId = mobileInstallationIdSchema.safeParse(
        req.params.installationId,
      );
      if (!installationId.success) {
        return res.status(400).json({ message: "Invalid installation id" });
      }
      const now = new Date();
      const [device] = await db
        .update(mobileDeviceRegistrations)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(mobileDeviceRegistrations.userId, req.dbUser!.id),
            eq(mobileDeviceRegistrations.installationId, installationId.data),
          ),
        )
        .returning(publicDeviceFields);
      if (!device) return res.status(404).json({ message: "Device not found" });
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ device });
    }),
  );
}
