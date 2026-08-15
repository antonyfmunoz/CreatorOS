import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  createDeveloperApiKeySchema,
  createDeveloperOAuthAppSchema,
  createDeveloperWebhookSchema,
  developerApiScopes,
  developerCursor,
  parseDeveloperCursor,
  developerWebhookEventTypes,
  isSafeWebhookUrl,
  oauthAuthorizationSchema,
  developerAppListingSchema,
  developerAppReviewSchema,
} from "@shared/developer-platform";
import {
  analyticsEvents,
  assets,
  businesses,
  businessMembers,
  developerApiKeys,
  developerApiRateWindows,
  developerApiRequests,
  developerWebhookDeliveries,
  developerWebhookEndpoints,
  developerWebhookEvents,
  developerOAuthAccessTokens,
  developerOAuthApps,
  developerOAuthAuthorizationCodes,
  developerOAuthInstallations,
  developerOAuthRateWindows,
  developerOAuthRefreshTokens,
  developerSandboxes,
  products,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";
import { recordOperationalServiceEvent } from "./operations";
import { rateLimit } from "express-rate-limit";
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  isSensitiveDataEncryptionConfigured,
} from "./sensitive-data";

type DeveloperScope = (typeof developerApiScopes)[number];
type DeveloperAuthentication = {
  keyId: string | null;
  credentialId: string;
  credentialKind: "api_key" | "oauth";
  businessId: string;
  scopes: string[];
};

function apiKeyPepper() {
  return process.env.DEVELOPER_API_KEY_PEPPER?.trim() || null;
}
function hashApiKey(value: string) {
  const pepper = apiKeyPepper();
  if (!pepper) throw new Error("DEVELOPER_API_KEY_PEPPER is not configured");
  return crypto.createHmac("sha256", pepper).update(value).digest("hex");
}
function secureHashEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function prepareOAuthTokens(input: {
  installationId: string;
  scopes: string[];
  familyId?: string;
}) {
  const accessToken = `cos_oauth_${crypto.randomBytes(32).toString("base64url")}`;
  const refreshToken = `cos_refresh_${crypto.randomBytes(32).toString("base64url")}`;
  const accessExpiresAt = new Date(Date.now() + 60 * 60_000);
  const refreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60_000);
  const familyId = input.familyId ?? crypto.randomUUID();
  return {
    accessToken,
    refreshToken,
    accessExpiresAt,
    familyId,
    accessValues: {
      installationId: input.installationId,
      tokenPrefix: accessToken.slice(0, 16),
      tokenHash: hashApiKey(accessToken),
      scopes: input.scopes,
      expiresAt: accessExpiresAt,
    },
    refreshValues: {
      installationId: input.installationId,
      familyId,
      tokenHash: hashApiKey(refreshToken),
      scopes: input.scopes,
      expiresAt: refreshExpiresAt,
    },
  };
}

class InvalidOAuthGrantError extends Error {}
function publicEndpoint(
  endpoint: typeof developerWebhookEndpoints.$inferSelect,
) {
  const { secretCiphertext: _secretCiphertext, ...safe } = endpoint;
  return safe;
}
function developerAuth(req: Request) {
  return (
    (req as Request & { developerAuth?: DeveloperAuthentication })
      .developerAuth ?? null
  );
}

async function authenticateDeveloperCredential(token: string): Promise<DeveloperAuthentication | null> {
  if (!apiKeyPepper()) return null;
  if (/^cos_oauth_[A-Za-z0-9_-]{40,}$/.test(token)) {
    const [context] = await db
      .select({ token: developerOAuthAccessTokens, installation: developerOAuthInstallations, app: developerOAuthApps })
      .from(developerOAuthAccessTokens)
      .innerJoin(developerOAuthInstallations, eq(developerOAuthInstallations.id, developerOAuthAccessTokens.installationId))
      .innerJoin(developerOAuthApps, eq(developerOAuthApps.id, developerOAuthInstallations.appId))
      .where(eq(developerOAuthAccessTokens.tokenHash, hashApiKey(token)))
      .limit(1);
    if (!context || context.token.revokedAt || context.token.expiresAt <= new Date() || context.installation.status !== "active" || context.app.status !== "active") return null;
    return { keyId: null, credentialId: context.token.id, credentialKind: "oauth", businessId: context.installation.businessId, scopes: context.token.scopes };
  }
  if (/^cos_[A-Za-z0-9_-]{40,}$/.test(token)) {
    const [key] = await db.select().from(developerApiKeys).where(eq(developerApiKeys.keyHash, hashApiKey(token))).limit(1);
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date())) return null;
    return { keyId: key.id, credentialId: key.id, credentialKind: "api_key", businessId: key.businessId, scopes: key.scopes };
  }
  return null;
}

async function consumeDeveloperRateWindow(auth: DeveloperAuthentication) {
  const now = Date.now();
  const windowStartedAt = new Date(Math.floor(now / 60_000) * 60_000);
  const values = { windowStartedAt, requestCount: 1, expiresAt: new Date(windowStartedAt.getTime() + 5 * 60_000) };
  if (auth.credentialKind === "api_key") {
    const [window] = await db.insert(developerApiRateWindows).values({ ...values, apiKeyId: auth.credentialId }).onConflictDoUpdate({ target: [developerApiRateWindows.apiKeyId, developerApiRateWindows.windowStartedAt], set: { requestCount: sql`${developerApiRateWindows.requestCount} + 1` } }).returning({ requestCount: developerApiRateWindows.requestCount });
    return { now, windowStartedAt, count: window.requestCount };
  }
  const [window] = await db.insert(developerOAuthRateWindows).values({ ...values, accessTokenId: auth.credentialId }).onConflictDoUpdate({ target: [developerOAuthRateWindows.accessTokenId, developerOAuthRateWindows.windowStartedAt], set: { requestCount: sql`${developerOAuthRateWindows.requestCount} + 1` } }).returning({ requestCount: developerOAuthRateWindows.requestCount });
  return { now, windowStartedAt, count: window.requestCount };
}

function requireDeveloperScope(scope: DeveloperScope) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startedAt = performance.now();
    const authorization = req.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
    if (!token || !apiKeyPepper())
      return res.status(401).json({
        error: {
          code: "invalid_api_key",
          message: "A valid API key is required",
        },
      });
    const auth = await authenticateDeveloperCredential(token);
    if (!auth)
      return res.status(401).json({
        error: {
          code: "invalid_api_key",
          message: "This API key is unavailable",
        },
      });
    if (!auth.scopes.includes(scope))
      return res.status(403).json({
        error: {
          code: "insufficient_scope",
          message: `${scope} is required`,
        },
      });
    const window = await consumeDeveloperRateWindow(auth);
    res.setHeader("X-RateLimit-Limit", "120");
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, 120 - window.count)),
    );
    if (window.count > 120) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((window.windowStartedAt.getTime() + 60_000 - window.now) / 1_000)),
      );
      return res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Try again after the current window",
        },
      });
    }
    const requestId =
      req.get("x-request-id")?.slice(0, 120) || crypto.randomUUID();
    res.setHeader("X-Request-Id", requestId);
    (
      req as Request & { developerAuth: DeveloperAuthentication }
    ).developerAuth = {
      ...auth,
    };
    const lastUsedWrite = auth.credentialKind === "api_key"
      ? db.update(developerApiKeys).set({ lastUsedAt: new Date() }).where(eq(developerApiKeys.id, auth.credentialId))
      : db.update(developerOAuthAccessTokens).set({ lastUsedAt: new Date() }).where(eq(developerOAuthAccessTokens.id, auth.credentialId));
    void lastUsedWrite
      .catch((error) =>
        console.error("Failed to record developer API key use:", error),
      );
    res.once("finish", () => {
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      void Promise.all([
        db.insert(developerApiRequests).values({
          businessId: auth.businessId,
          apiKeyId: auth.keyId,
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        }),
        recordOperationalServiceEvent({
          businessId: auth.businessId,
          service: "developer_api",
          success: res.statusCode < 500,
          durationMs,
          statusCode: res.statusCode,
          sourceType: "developer_api_request",
          sourceId: requestId,
        }),
      ]).catch((error) =>
        console.error("Failed to record developer API request:", error),
      );
    });
    next();
  };
}

export async function emitDeveloperWebhookEvent(input: {
  businessId: string;
  eventType: (typeof developerWebhookEventTypes)[number];
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  let [event] = await db
    .insert(developerWebhookEvents)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (!event) {
    [event] = await db
      .select()
      .from(developerWebhookEvents)
      .where(
        and(
          eq(developerWebhookEvents.businessId, input.businessId),
          eq(developerWebhookEvents.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
  }
  const endpoints = await db
    .select()
    .from(developerWebhookEndpoints)
    .where(
      and(
        eq(developerWebhookEndpoints.businessId, input.businessId),
        eq(developerWebhookEndpoints.status, "active"),
      ),
    );
  const subscribed = endpoints.filter((endpoint) =>
    endpoint.events.includes(input.eventType),
  );
  if (subscribed.length)
    await db
      .insert(developerWebhookDeliveries)
      .values(
        subscribed.map((endpoint) => ({
          eventId: event.id,
          endpointId: endpoint.id,
        })),
      )
      .onConflictDoNothing();
  return event;
}

export function developerWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
) {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

async function deliverOne(
  delivery: typeof developerWebhookDeliveries.$inferSelect,
) {
  const startedAt = performance.now();
  const [context] = await db
    .select({
      event: developerWebhookEvents,
      endpoint: developerWebhookEndpoints,
    })
    .from(developerWebhookDeliveries)
    .innerJoin(
      developerWebhookEvents,
      eq(developerWebhookEvents.id, developerWebhookDeliveries.eventId),
    )
    .innerJoin(
      developerWebhookEndpoints,
      eq(developerWebhookEndpoints.id, developerWebhookDeliveries.endpointId),
    )
    .where(eq(developerWebhookDeliveries.id, delivery.id))
    .limit(1);
  if (!context || context.endpoint.status !== "active") return;
  const attempt = delivery.attempt + 1;
  await db
    .update(developerWebhookDeliveries)
    .set({ status: "delivering", attempt, updatedAt: new Date() })
    .where(eq(developerWebhookDeliveries.id, delivery.id));
  const body = JSON.stringify({
    id: context.event.id,
    type: context.event.eventType,
    createdAt: context.event.createdAt.toISOString(),
    data: context.event.payload,
  });
  const timestamp = String(Math.floor(Date.now() / 1_000));
  try {
    const response = await fetch(context.endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "CreativesOS-Webhooks/1.0",
        "x-creativesos-event-id": context.event.id,
        "x-creativesos-timestamp": timestamp,
        "x-creativesos-signature": developerWebhookSignature(
          decryptSensitiveValue(context.endpoint.secretCiphertext),
          timestamp,
          body,
        ),
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const deliveredAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(developerWebhookDeliveries)
        .set({
          status: "delivered",
          responseCode: response.status,
          deliveredAt,
          updatedAt: deliveredAt,
        })
        .where(eq(developerWebhookDeliveries.id, delivery.id));
      await tx
        .update(developerWebhookEndpoints)
        .set({
          consecutiveFailures: 0,
          lastDeliveryAt: deliveredAt,
          updatedAt: deliveredAt,
        })
        .where(eq(developerWebhookEndpoints.id, context.endpoint.id));
    });
    void recordOperationalServiceEvent({
      businessId: context.event.businessId,
      service: "webhooks",
      success: true,
      durationMs: performance.now() - startedAt,
      statusCode: response.status,
      sourceType: "webhook_delivery",
      sourceId: `${delivery.id}:${attempt}`,
    }).catch((telemetryError) =>
      console.error("Webhook operational telemetry failed:", telemetryError),
    );
  } catch (error) {
    const dead = attempt >= 8;
    const failures = context.endpoint.consecutiveFailures + 1;
    const nextAttemptAt = new Date(
      Date.now() + Math.min(3_600_000, 2 ** attempt * 5_000),
    );
    await db.transaction(async (tx) => {
      await tx
        .update(developerWebhookDeliveries)
        .set({
          status: dead ? "dead_letter" : "retrying",
          errorCode:
            error instanceof Error
              ? error.message.slice(0, 160)
              : "DELIVERY_FAILED",
          nextAttemptAt,
          updatedAt: new Date(),
        })
        .where(eq(developerWebhookDeliveries.id, delivery.id));
      await tx
        .update(developerWebhookEndpoints)
        .set({
          consecutiveFailures: failures,
          status: failures >= 8 ? "disabled" : context.endpoint.status,
          disabledAt: failures >= 8 ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(developerWebhookEndpoints.id, context.endpoint.id));
    });
    void recordOperationalServiceEvent({
      businessId: context.event.businessId,
      service: "webhooks",
      success: false,
      durationMs: performance.now() - startedAt,
      sourceType: "webhook_delivery",
      sourceId: `${delivery.id}:${attempt}`,
    }).catch((telemetryError) =>
      console.error("Webhook operational telemetry failed:", telemetryError),
    );
  }
}

export async function processDeveloperWebhookDeliveries(limit = 25) {
  const expiredSandboxes = await db.select().from(developerSandboxes).where(and(eq(developerSandboxes.status, "active"), lte(developerSandboxes.expiresAt, new Date()))).limit(25);
  for (const sandbox of expiredSandboxes) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(developerSandboxes).set({ status: "expired", updatedAt: now }).where(and(eq(developerSandboxes.id, sandbox.id), eq(developerSandboxes.status, "active")));
      await tx.update(businesses).set({ status: "archived", updatedAt: now }).where(eq(businesses.id, sandbox.businessId));
      await tx.update(developerApiKeys).set({ revokedAt: now }).where(eq(developerApiKeys.businessId, sandbox.businessId));
      const revokedInstallations = await tx.update(developerOAuthInstallations).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(eq(developerOAuthInstallations.businessId, sandbox.businessId)).returning({ id: developerOAuthInstallations.id });
      const installationIds = revokedInstallations.map(({ id }) => id);
      if (installationIds.length) {
        await tx.update(developerOAuthAccessTokens).set({ revokedAt: now }).where(inArray(developerOAuthAccessTokens.installationId, installationIds));
        await tx.update(developerOAuthRefreshTokens).set({ revokedAt: now }).where(inArray(developerOAuthRefreshTokens.installationId, installationIds));
      }
    });
  }
  await db.delete(developerApiRateWindows).where(lt(developerApiRateWindows.expiresAt, new Date()));
  await db.delete(developerOAuthRateWindows).where(lt(developerOAuthRateWindows.expiresAt, new Date()));
  const rows = await db
    .select()
    .from(developerWebhookDeliveries)
    .where(
      and(
        inArray(developerWebhookDeliveries.status, ["pending", "retrying"]),
        lte(developerWebhookDeliveries.nextAttemptAt, new Date()),
      ),
    )
    .orderBy(asc(developerWebhookDeliveries.nextAttemptAt))
    .limit(limit);
  for (const delivery of rows) await deliverOne(delivery);
  return rows.length;
}

export function scheduleDeveloperWebhookProcessing(intervalMs = 15_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processDeveloperWebhookDeliveries();
    } catch (error) {
      console.error("Developer webhook processing failed:", error);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return timer;
}

export function registerDeveloperPlatformRoutes(app: Express) {
  if (process.env.CREATOROS_QUALIFICATION_MODE === "true")
    app.post("/api/qualification/developer-webhook-sink", (_req, res) =>
      res.status(204).send(),
    );

  app.get("/api/v1/openapi.json", (_req, res) => {
    res.json({
      openapi: "3.1.0",
      info: { title: "CreativesOS Developer API", version: "1.0.0" },
      servers: [
        {
          url: `${(process.env.PUBLIC_APP_URL ?? "https://creativesos.net").replace(/\/$/, "")}/api/v1`,
        },
      ],
      security: [{ bearerAuth: [] }],
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      },
      paths: {
        "/profile": {
          get: {
            summary: "Get the authorized business profile",
            security: [{ bearerAuth: ["profile:read"] }],
          },
        },
        "/assets": {
          get: {
            summary: "List governed media assets",
            security: [{ bearerAuth: ["assets:read"] }],
          },
        },
        "/products": {
          get: {
            summary: "List business products",
            security: [{ bearerAuth: ["products:read"] }],
          },
        },
        "/analytics/summary": {
          get: {
            summary: "Summarize first-party event counts",
            security: [{ bearerAuth: ["analytics:read"] }],
          },
        },
      },
    });
  });

  app.get("/api/apps", async (_req, res) => {
    const rows = await db.select({ id: developerOAuthApps.id, name: developerOAuthApps.name, clientId: developerOAuthApps.clientId, description: developerOAuthApps.description, homepageUrl: developerOAuthApps.homepageUrl, privacyUrl: developerOAuthApps.privacyUrl, termsUrl: developerOAuthApps.termsUrl, scopes: developerOAuthApps.scopes, redirectUris: developerOAuthApps.redirectUris, publishedAt: developerOAuthApps.publishedAt }).from(developerOAuthApps).where(and(eq(developerOAuthApps.status, "active"), eq(developerOAuthApps.visibility, "public"), eq(developerOAuthApps.reviewStatus, "approved"))).orderBy(desc(developerOAuthApps.publishedAt));
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(rows.map(({ redirectUris, ...row }) => ({ ...row, authorizeUrl: redirectUris[0] ? `/oauth/authorize?client_id=${encodeURIComponent(row.clientId)}&redirect_uri=${encodeURIComponent(redirectUris[0])}&scope=${encodeURIComponent(row.scopes.join(" "))}` : null })));
  });

  app.get("/api/developer", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [keys, endpoints, deliveries, requestStats, oauthApps, installations, sandboxes] = await Promise.all([
      db
        .select({
          id: developerApiKeys.id,
          name: developerApiKeys.name,
          keyPrefix: developerApiKeys.keyPrefix,
          scopes: developerApiKeys.scopes,
          lastUsedAt: developerApiKeys.lastUsedAt,
          expiresAt: developerApiKeys.expiresAt,
          revokedAt: developerApiKeys.revokedAt,
          createdAt: developerApiKeys.createdAt,
        })
        .from(developerApiKeys)
        .where(eq(developerApiKeys.businessId, business.id))
        .orderBy(desc(developerApiKeys.createdAt)),
      db
        .select()
        .from(developerWebhookEndpoints)
        .where(eq(developerWebhookEndpoints.businessId, business.id))
        .orderBy(desc(developerWebhookEndpoints.createdAt)),
      db
        .select()
        .from(developerWebhookDeliveries)
        .innerJoin(
          developerWebhookEndpoints,
          eq(
            developerWebhookEndpoints.id,
            developerWebhookDeliveries.endpointId,
          ),
        )
        .where(eq(developerWebhookEndpoints.businessId, business.id))
        .orderBy(desc(developerWebhookDeliveries.createdAt))
        .limit(50),
      db
        .select({
          count: sql<number>`count(*)`,
          failures: sql<number>`count(*) filter (where ${developerApiRequests.statusCode} >= 400)`,
        })
        .from(developerApiRequests)
        .where(eq(developerApiRequests.businessId, business.id)),
      db.select({ id: developerOAuthApps.id, name: developerOAuthApps.name, clientId: developerOAuthApps.clientId, redirectUris: developerOAuthApps.redirectUris, scopes: developerOAuthApps.scopes, description: developerOAuthApps.description, homepageUrl: developerOAuthApps.homepageUrl, privacyUrl: developerOAuthApps.privacyUrl, termsUrl: developerOAuthApps.termsUrl, visibility: developerOAuthApps.visibility, reviewStatus: developerOAuthApps.reviewStatus, reviewNote: developerOAuthApps.reviewNote, status: developerOAuthApps.status, createdAt: developerOAuthApps.createdAt }).from(developerOAuthApps).where(eq(developerOAuthApps.ownerBusinessId, business.id)).orderBy(desc(developerOAuthApps.createdAt)),
      db.select({ installation: developerOAuthInstallations, app: { id: developerOAuthApps.id, name: developerOAuthApps.name, clientId: developerOAuthApps.clientId } }).from(developerOAuthInstallations).innerJoin(developerOAuthApps, eq(developerOAuthApps.id, developerOAuthInstallations.appId)).where(eq(developerOAuthInstallations.businessId, business.id)).orderBy(desc(developerOAuthInstallations.installedAt)),
      db.select({ sandbox: developerSandboxes, app: { id: developerOAuthApps.id, name: developerOAuthApps.name }, business: { id: businesses.id, name: businesses.name, handle: businesses.handle } }).from(developerSandboxes).innerJoin(developerOAuthApps, eq(developerOAuthApps.id, developerSandboxes.appId)).innerJoin(businesses, eq(businesses.id, developerSandboxes.businessId)).where(eq(developerSandboxes.ownerUserId, req.dbUser!.id)).orderBy(desc(developerSandboxes.createdAt)),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      configured: Boolean(
        apiKeyPepper() && isSensitiveDataEncryptionConfigured(),
      ),
      scopes: developerApiScopes,
      eventTypes: developerWebhookEventTypes,
      keys,
      endpoints: endpoints.map(publicEndpoint),
      deliveries,
      requestStats: requestStats[0] ?? { count: 0, failures: 0 },
      oauthApps,
      installations,
      sandboxes,
    });
  });

  app.post("/api/developer/oauth-apps", attachUser, async (req, res) => {
    const parsed = createDeveloperOAuthAppSchema.safeParse(req.body);
    const allowLocal = process.env.CREATOROS_QUALIFICATION_MODE === "true";
    if (!parsed.success || parsed.data.redirectUris.some((uri) => !isSafeWebhookUrl(uri, allowLocal)))
      return res.status(400).json({ message: "Use authorized HTTPS redirect URIs" });
    if (!apiKeyPepper()) return res.status(503).json({ message: "Developer credential custody is not configured" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const clientId = `cos_client_${crypto.randomBytes(18).toString("base64url")}`;
    const clientSecret = `cos_secret_${crypto.randomBytes(32).toString("base64url")}`;
    const [oauthApp] = await db.insert(developerOAuthApps).values({ ownerBusinessId: business.id, createdByUserId: req.dbUser!.id, name: parsed.data.name, clientId, clientSecretHash: hashApiKey(clientSecret), redirectUris: Array.from(new Set(parsed.data.redirectUris)), scopes: Array.from(new Set(parsed.data.scopes)) }).returning();
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ app: { id: oauthApp.id, name: oauthApp.name, clientId: oauthApp.clientId, redirectUris: oauthApp.redirectUris, scopes: oauthApp.scopes, status: oauthApp.status, createdAt: oauthApp.createdAt }, clientSecret, warning: "Copy this client secret now. CreativesOS stores only its hash." });
  });

  app.delete("/api/developer/oauth-apps/:id", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [oauthApp] = await db.select().from(developerOAuthApps).where(and(eq(developerOAuthApps.id, req.params.id), eq(developerOAuthApps.ownerBusinessId, business.id))).limit(1);
    if (!oauthApp) return res.status(404).json({ message: "OAuth app not found" });
    await db.transaction(async (tx) => {
      await tx.update(developerOAuthApps).set({ status: "revoked", updatedAt: new Date() }).where(eq(developerOAuthApps.id, oauthApp.id));
      await tx.update(developerOAuthInstallations).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(eq(developerOAuthInstallations.appId, oauthApp.id));
    });
    res.status(204).send();
  });

  app.put("/api/developer/oauth-apps/:id/listing", attachUser, async (req, res) => {
    const parsed = developerAppListingSchema.safeParse(req.body);
    if (!parsed.success || [parsed.data?.homepageUrl, parsed.data?.privacyUrl, parsed.data?.termsUrl].filter(Boolean).some((url) => !isSafeWebhookUrl(String(url)))) return res.status(400).json({ message: parsed.success ? "Listing URLs must use public HTTPS" : parsed.error.issues[0]?.message ?? "Invalid listing" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [oauthApp] = await db.update(developerOAuthApps).set({ ...parsed.data, visibility: "private", reviewStatus: "draft", reviewNote: null, reviewedByUserId: null, reviewedAt: null, publishedAt: null, updatedAt: new Date() }).where(and(eq(developerOAuthApps.id, req.params.id), eq(developerOAuthApps.ownerBusinessId, business.id), eq(developerOAuthApps.status, "active"))).returning();
    if (!oauthApp) return res.status(404).json({ message: "OAuth app not found" });
    res.json({ id: oauthApp.id, reviewStatus: oauthApp.reviewStatus });
  });

  app.post("/api/developer/oauth-apps/:id/submit", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [oauthApp] = await db.select().from(developerOAuthApps).where(and(eq(developerOAuthApps.id, req.params.id), eq(developerOAuthApps.ownerBusinessId, business.id), eq(developerOAuthApps.status, "active"))).limit(1);
    if (!oauthApp) return res.status(404).json({ message: "OAuth app not found" });
    if (!oauthApp.description || !oauthApp.homepageUrl || !oauthApp.privacyUrl || !oauthApp.termsUrl) return res.status(409).json({ message: "Complete the public listing before submitting" });
    await db.update(developerOAuthApps).set({ reviewStatus: "pending", visibility: "private", updatedAt: new Date() }).where(eq(developerOAuthApps.id, oauthApp.id));
    res.status(202).json({ reviewStatus: "pending" });
  });

  app.get("/api/admin/developer/apps", attachUser, async (req, res) => {
    if (req.dbUser!.role !== "admin") return res.status(403).json({ message: "Platform administrator access is required" });
    res.json(await db.select({ id: developerOAuthApps.id, name: developerOAuthApps.name, clientId: developerOAuthApps.clientId, description: developerOAuthApps.description, homepageUrl: developerOAuthApps.homepageUrl, privacyUrl: developerOAuthApps.privacyUrl, termsUrl: developerOAuthApps.termsUrl, scopes: developerOAuthApps.scopes, reviewStatus: developerOAuthApps.reviewStatus, createdAt: developerOAuthApps.createdAt }).from(developerOAuthApps).where(eq(developerOAuthApps.reviewStatus, "pending")).orderBy(asc(developerOAuthApps.createdAt)));
  });

  app.post("/api/admin/developer/apps/:id/review", attachUser, async (req, res) => {
    if (req.dbUser!.role !== "admin") return res.status(403).json({ message: "Platform administrator access is required" });
    const parsed = developerAppReviewSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid review" });
    const now = new Date();
    const [oauthApp] = await db.update(developerOAuthApps).set({ reviewStatus: parsed.data.decision, reviewNote: parsed.data.note, visibility: parsed.data.decision === "approved" ? "public" : "private", reviewedByUserId: req.dbUser!.id, reviewedAt: now, publishedAt: parsed.data.decision === "approved" ? now : null, updatedAt: now }).where(and(eq(developerOAuthApps.id, req.params.id), eq(developerOAuthApps.reviewStatus, "pending"), eq(developerOAuthApps.status, "active"))).returning();
    if (!oauthApp) return res.status(404).json({ message: "Pending app not found" });
    res.json({ id: oauthApp.id, reviewStatus: oauthApp.reviewStatus, visibility: oauthApp.visibility });
  });

  app.post("/api/developer/oauth-apps/:id/sandboxes", attachUser, async (req, res) => {
    if (!apiKeyPepper()) return res.status(503).json({ message: "Developer credential custody is not configured" });
    const [oauthApp] = await db.select().from(developerOAuthApps).where(eq(developerOAuthApps.id, req.params.id)).limit(1);
    if (!oauthApp || !(await userCanManageBusiness(req.dbUser!.id, oauthApp.ownerBusinessId)) || oauthApp.status !== "active") return res.status(404).json({ message: "OAuth app not found" });
    const active = await db.select({ id: developerSandboxes.id }).from(developerSandboxes).where(and(eq(developerSandboxes.ownerUserId, req.dbUser!.id), eq(developerSandboxes.status, "active"), gt(developerSandboxes.expiresAt, new Date())));
    if (active.length >= 3) return res.status(429).json({ message: "At most three active sandboxes are allowed" });
    const rawKey = `cos_${crypto.randomBytes(32).toString("base64url")}`;
    const result = await db.transaction(async (tx) => {
      const suffix = crypto.randomBytes(6).toString("hex");
      const [business] = await tx.insert(businesses).values({ ownerUserId: req.dbUser!.id, name: `${oauthApp.name} Sandbox`, handle: `sandbox_${req.dbUser!.id}_${suffix}`, description: "Ephemeral CreativesOS developer sandbox", isDefault: false, status: "active" }).returning();
      await tx.insert(businessMembers).values({ businessId: business.id, userId: req.dbUser!.id, role: "owner" }).onConflictDoNothing();
      const [sandbox] = await tx.insert(developerSandboxes).values({ appId: oauthApp.id, ownerUserId: req.dbUser!.id, businessId: business.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) }).returning();
      await tx.insert(developerApiKeys).values({ businessId: business.id, createdByUserId: req.dbUser!.id, name: "Sandbox key", keyPrefix: rawKey.slice(0, 12), keyHash: hashApiKey(rawKey), scopes: oauthApp.scopes, expiresAt: sandbox.expiresAt });
      return { sandbox, business };
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ ...result, apiKey: rawKey, warning: "Copy this sandbox key now. It expires with the sandbox and is stored only as a hash." });
  });

  app.delete("/api/developer/sandboxes/:id", attachUser, async (req, res) => {
    const [sandbox] = await db.select().from(developerSandboxes).where(and(eq(developerSandboxes.id, req.params.id), eq(developerSandboxes.ownerUserId, req.dbUser!.id))).limit(1);
    if (!sandbox) return res.status(404).json({ message: "Sandbox not found" });
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(developerSandboxes).set({ status: "revoked", updatedAt: now }).where(eq(developerSandboxes.id, sandbox.id));
      await tx.update(businesses).set({ status: "archived", updatedAt: now }).where(eq(businesses.id, sandbox.businessId));
      await tx.update(developerApiKeys).set({ revokedAt: now }).where(eq(developerApiKeys.businessId, sandbox.businessId));
      const revokedInstallations = await tx.update(developerOAuthInstallations).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(eq(developerOAuthInstallations.businessId, sandbox.businessId)).returning({ id: developerOAuthInstallations.id });
      const installationIds = revokedInstallations.map(({ id }) => id);
      if (installationIds.length) {
        await tx.update(developerOAuthAccessTokens).set({ revokedAt: now }).where(inArray(developerOAuthAccessTokens.installationId, installationIds));
        await tx.update(developerOAuthRefreshTokens).set({ revokedAt: now }).where(inArray(developerOAuthRefreshTokens.installationId, installationIds));
      }
    });
    res.status(204).send();
  });

  app.get("/api/oauth/authorize/context", attachUser, async (req, res) => {
    const parsed = oauthAuthorizationSchema.safeParse({ clientId: req.query.client_id, redirectUri: req.query.redirect_uri, scopes: typeof req.query.scope === "string" ? req.query.scope.split(" ").filter(Boolean) : [], state: req.query.state ?? "" });
    if (!parsed.success) return res.status(400).json({ message: "Invalid authorization request" });
    const [oauthApp] = await db.select({ id: developerOAuthApps.id, name: developerOAuthApps.name, clientId: developerOAuthApps.clientId, redirectUris: developerOAuthApps.redirectUris, scopes: developerOAuthApps.scopes, status: developerOAuthApps.status }).from(developerOAuthApps).where(eq(developerOAuthApps.clientId, parsed.data.clientId)).limit(1);
    if (!oauthApp || oauthApp.status !== "active" || !oauthApp.redirectUris.includes(parsed.data.redirectUri) || parsed.data.scopes.some((scope) => !oauthApp.scopes.includes(scope))) return res.status(400).json({ message: "Authorization request is not permitted" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    res.setHeader("Cache-Control", "no-store");
    res.json({ app: { name: oauthApp.name, clientId: oauthApp.clientId }, business: { id: business.id, name: business.name }, scopes: parsed.data.scopes, state: parsed.data.state, redirectUri: parsed.data.redirectUri });
  });

  app.post("/api/oauth/authorize", attachUser, async (req, res) => {
    const parsed = oauthAuthorizationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid authorization request" });
    const [oauthApp] = await db.select().from(developerOAuthApps).where(eq(developerOAuthApps.clientId, parsed.data.clientId)).limit(1);
    if (!oauthApp || oauthApp.status !== "active" || !oauthApp.redirectUris.includes(parsed.data.redirectUri) || parsed.data.scopes.some((scope) => !oauthApp.scopes.includes(scope))) return res.status(400).json({ message: "Authorization request is not permitted" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [installation] = await db.insert(developerOAuthInstallations).values({ appId: oauthApp.id, businessId: business.id, installedByUserId: req.dbUser!.id, scopes: parsed.data.scopes }).onConflictDoUpdate({ target: [developerOAuthInstallations.appId, developerOAuthInstallations.businessId], set: { scopes: parsed.data.scopes, status: "active", revokedAt: null, updatedAt: new Date(), installedByUserId: req.dbUser!.id } }).returning();
    const code = `cos_code_${crypto.randomBytes(32).toString("base64url")}`;
    await db.insert(developerOAuthAuthorizationCodes).values({ installationId: installation.id, codeHash: hashApiKey(code), redirectUri: parsed.data.redirectUri, scopes: parsed.data.scopes, expiresAt: new Date(Date.now() + 5 * 60_000) });
    const redirect = new URL(parsed.data.redirectUri);
    redirect.searchParams.set("code", code);
    if (parsed.data.state) redirect.searchParams.set("state", parsed.data.state);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({ redirectUrl: redirect.toString() });
  });

  app.post("/oauth/token", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    const { grant_type, client_id, client_secret, code, redirect_uri, refresh_token } = req.body ?? {};
    if (!client_id || !client_secret || !apiKeyPepper()) return res.status(400).json({ error: "invalid_request" });
    let issued: ReturnType<typeof prepareOAuthTokens>;
    let scopes: string[];
    if (grant_type === "authorization_code") {
      if (!code || !redirect_uri) return res.status(400).json({ error: "invalid_request" });
      const [context] = await db.select({ authorizationCode: developerOAuthAuthorizationCodes, installation: developerOAuthInstallations, app: developerOAuthApps }).from(developerOAuthAuthorizationCodes).innerJoin(developerOAuthInstallations, eq(developerOAuthInstallations.id, developerOAuthAuthorizationCodes.installationId)).innerJoin(developerOAuthApps, eq(developerOAuthApps.id, developerOAuthInstallations.appId)).where(eq(developerOAuthAuthorizationCodes.codeHash, hashApiKey(String(code)))).limit(1);
      if (!context || context.authorizationCode.consumedAt || context.authorizationCode.expiresAt <= new Date() || context.authorizationCode.redirectUri !== redirect_uri || context.app.clientId !== client_id || !secureHashEqual(context.app.clientSecretHash, hashApiKey(String(client_secret))) || context.app.status !== "active" || context.installation.status !== "active") return res.status(400).json({ error: "invalid_grant" });
      scopes = context.authorizationCode.scopes;
      issued = prepareOAuthTokens({ installationId: context.installation.id, scopes });
      try {
        await db.transaction(async (tx) => {
          const consumed = await tx.update(developerOAuthAuthorizationCodes).set({ consumedAt: new Date() }).where(and(eq(developerOAuthAuthorizationCodes.id, context.authorizationCode.id), isNull(developerOAuthAuthorizationCodes.consumedAt), gt(developerOAuthAuthorizationCodes.expiresAt, new Date()))).returning({ id: developerOAuthAuthorizationCodes.id });
          if (!consumed.length) throw new InvalidOAuthGrantError();
          await tx.insert(developerOAuthAccessTokens).values(issued.accessValues);
          await tx.insert(developerOAuthRefreshTokens).values(issued.refreshValues);
        });
      } catch (error) {
        if (error instanceof InvalidOAuthGrantError)
          return res.status(400).json({ error: "invalid_grant" });
        throw error;
      }
    } else if (grant_type === "refresh_token") {
      if (!refresh_token) return res.status(400).json({ error: "invalid_request" });
      const [context] = await db.select({ refreshToken: developerOAuthRefreshTokens, installation: developerOAuthInstallations, app: developerOAuthApps }).from(developerOAuthRefreshTokens).innerJoin(developerOAuthInstallations, eq(developerOAuthInstallations.id, developerOAuthRefreshTokens.installationId)).innerJoin(developerOAuthApps, eq(developerOAuthApps.id, developerOAuthInstallations.appId)).where(eq(developerOAuthRefreshTokens.tokenHash, hashApiKey(String(refresh_token)))).limit(1);
      if (!context || context.app.clientId !== client_id || !secureHashEqual(context.app.clientSecretHash, hashApiKey(String(client_secret))) || context.app.status !== "active" || context.installation.status !== "active" || context.refreshToken.expiresAt <= new Date() || context.refreshToken.revokedAt) return res.status(400).json({ error: "invalid_grant" });
      if (context.refreshToken.rotatedAt) {
        await db.update(developerOAuthRefreshTokens).set({ revokedAt: new Date() }).where(eq(developerOAuthRefreshTokens.familyId, context.refreshToken.familyId));
        await db.update(developerOAuthAccessTokens).set({ revokedAt: new Date() }).where(eq(developerOAuthAccessTokens.installationId, context.installation.id));
        return res.status(400).json({ error: "invalid_grant" });
      }
      scopes = context.refreshToken.scopes;
      issued = prepareOAuthTokens({ installationId: context.installation.id, scopes, familyId: context.refreshToken.familyId });
      try {
        await db.transaction(async (tx) => {
          const rotated = await tx.update(developerOAuthRefreshTokens).set({ rotatedAt: new Date() }).where(and(eq(developerOAuthRefreshTokens.id, context.refreshToken.id), isNull(developerOAuthRefreshTokens.rotatedAt), isNull(developerOAuthRefreshTokens.revokedAt), gt(developerOAuthRefreshTokens.expiresAt, new Date()))).returning({ id: developerOAuthRefreshTokens.id });
          if (!rotated.length) throw new InvalidOAuthGrantError();
          await tx.insert(developerOAuthAccessTokens).values(issued.accessValues);
          await tx.insert(developerOAuthRefreshTokens).values(issued.refreshValues);
        });
      } catch (error) {
        if (error instanceof InvalidOAuthGrantError) {
          const now = new Date();
          await db.transaction(async (tx) => {
            await tx.update(developerOAuthRefreshTokens).set({ revokedAt: now }).where(eq(developerOAuthRefreshTokens.familyId, context.refreshToken.familyId));
            await tx.update(developerOAuthAccessTokens).set({ revokedAt: now }).where(eq(developerOAuthAccessTokens.installationId, context.installation.id));
          });
          return res.status(400).json({ error: "invalid_grant" });
        }
        throw error;
      }
    } else return res.status(400).json({ error: "unsupported_grant_type" });
    res.setHeader("Cache-Control", "no-store");
    res.json({ access_token: issued.accessToken, refresh_token: issued.refreshToken, token_type: "Bearer", expires_in: Math.floor((issued.accessExpiresAt.getTime() - Date.now()) / 1_000), scope: scopes.join(" ") });
  });

  app.delete("/api/developer/installations/:id", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [installation] = await db.select().from(developerOAuthInstallations).where(and(eq(developerOAuthInstallations.id, req.params.id), eq(developerOAuthInstallations.businessId, business.id))).limit(1);
    if (!installation) return res.status(404).json({ message: "Installation not found" });
    await db.transaction(async (tx) => {
      await tx.update(developerOAuthInstallations).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(eq(developerOAuthInstallations.id, installation.id));
      await tx.update(developerOAuthAccessTokens).set({ revokedAt: new Date() }).where(eq(developerOAuthAccessTokens.installationId, installation.id));
      await tx.update(developerOAuthRefreshTokens).set({ revokedAt: new Date() }).where(eq(developerOAuthRefreshTokens.installationId, installation.id));
    });
    res.status(204).send();
  });

  app.post("/api/developer/keys", attachUser, async (req, res) => {
    const parsed = createDeveloperApiKeySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid API key",
      });
    if (!apiKeyPepper())
      return res
        .status(503)
        .json({ message: "Developer API key custody is not configured" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const raw = `cos_${crypto.randomBytes(32).toString("base64url")}`;
    const [key] = await db
      .insert(developerApiKeys)
      .values({
        businessId: business.id,
        createdByUserId: req.dbUser!.id,
        name: parsed.data.name,
        keyPrefix: raw.slice(0, 12),
        keyHash: hashApiKey(raw),
        scopes: Array.from(new Set(parsed.data.scopes)),
        expiresAt: parsed.data.expiresAt ?? null,
      })
      .returning();
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      key: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      },
      secret: raw,
      warning: "Copy this key now. CreativesOS stores only its hash.",
    });
  });

  app.delete("/api/developer/keys/:id", attachUser, async (req, res) => {
    const [key] = await db
      .select()
      .from(developerApiKeys)
      .where(eq(developerApiKeys.id, req.params.id))
      .limit(1);
    if (!key || !(await userCanManageBusiness(req.dbUser!.id, key.businessId)))
      return res.status(404).json({ message: "API key not found" });
    await db
      .update(developerApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(developerApiKeys.id, key.id));
    res.status(204).send();
  });

  app.post("/api/developer/webhooks", attachUser, async (req, res) => {
    const parsed = createDeveloperWebhookSchema.safeParse(req.body);
    const allowLocal = process.env.CREATOROS_QUALIFICATION_MODE === "true";
    if (
      !parsed.success ||
      !isSafeWebhookUrl(String(req.body?.url ?? ""), allowLocal)
    )
      return res
        .status(400)
        .json({ message: "Use an authorized public HTTPS webhook URL" });
    if (!isSensitiveDataEncryptionConfigured())
      return res
        .status(503)
        .json({ message: "Webhook signing-secret custody is not configured" });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const secret = `whsec_${crypto.randomBytes(32).toString("base64url")}`;
    const [endpoint] = await db
      .insert(developerWebhookEndpoints)
      .values({
        businessId: business.id,
        createdByUserId: req.dbUser!.id,
        name: parsed.data.name,
        url: parsed.data.url,
        events: Array.from(new Set(parsed.data.events)),
        secretCiphertext: encryptSensitiveValue(secret),
      })
      .returning();
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      endpoint: publicEndpoint(endpoint),
      signingSecret: secret,
      warning: "Copy this signing secret now. It will not be shown again.",
    });
  });

  app.delete("/api/developer/webhooks/:id", attachUser, async (req, res) => {
    const [endpoint] = await db
      .select()
      .from(developerWebhookEndpoints)
      .where(eq(developerWebhookEndpoints.id, req.params.id))
      .limit(1);
    if (
      !endpoint ||
      !(await userCanManageBusiness(req.dbUser!.id, endpoint.businessId))
    )
      return res.status(404).json({ message: "Webhook endpoint not found" });
    await db
      .update(developerWebhookEndpoints)
      .set({ status: "revoked", disabledAt: new Date(), updatedAt: new Date() })
      .where(eq(developerWebhookEndpoints.id, endpoint.id));
    res.status(204).send();
  });

  app.post("/api/developer/webhooks/:id/test", attachUser, async (req, res) => {
    const [endpoint] = await db
      .select()
      .from(developerWebhookEndpoints)
      .where(eq(developerWebhookEndpoints.id, req.params.id))
      .limit(1);
    if (
      !endpoint ||
      !(await userCanManageBusiness(req.dbUser!.id, endpoint.businessId))
    )
      return res.status(404).json({ message: "Webhook endpoint not found" });
    const event = await emitDeveloperWebhookEvent({
      businessId: endpoint.businessId,
      eventType: "test.ping",
      aggregateType: "webhook_endpoint",
      aggregateId: endpoint.id,
      idempotencyKey: `test:${endpoint.id}:${crypto.randomUUID()}`,
      payload: { endpointId: endpoint.id, sentByUserId: req.dbUser!.id },
    });
    await processDeveloperWebhookDeliveries();
    const [delivery] = await db
      .select()
      .from(developerWebhookDeliveries)
      .where(
        and(
          eq(developerWebhookDeliveries.eventId, event.id),
          eq(developerWebhookDeliveries.endpointId, endpoint.id),
        ),
      )
      .limit(1);
    res.json({ event, delivery });
  });

  app.get(
    "/api/v1/profile",
    rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false }),
    requireDeveloperScope("profile:read"),
    async (req, res) => {
      const auth = developerAuth(req)!;
      const [business] = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          handle: businesses.handle,
          description: businesses.description,
          logoUrl: businesses.logoUrl,
          updatedAt: businesses.updatedAt,
        })
        .from(businesses)
        .where(eq(businesses.id, auth.businessId))
        .limit(1);
      res.json({ data: business });
    },
  );
  app.get(
    "/api/v1/assets",
    rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false }),
    requireDeveloperScope("assets:read"),
    async (req, res) => {
      const auth = developerAuth(req)!;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const cursor = parseDeveloperCursor(
        typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      );
      if (req.query.cursor && !cursor)
        return res
          .status(400)
          .json({
            error: { code: "invalid_cursor", message: "The cursor is invalid" },
          });
      const rows = await db
        .select({
          id: assets.id,
          kind: assets.kind,
          mimeType: assets.mimeType,
          sizeBytes: assets.sizeBytes,
          visibility: assets.visibility,
          status: assets.status,
          createdAt: assets.createdAt,
        })
        .from(assets)
        .where(
          and(
            eq(assets.businessId, auth.businessId),
            cursor
              ? or(
                  lt(assets.createdAt, cursor.createdAt),
                  and(
                    eq(assets.createdAt, cursor.createdAt),
                    lt(assets.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(assets.createdAt), desc(assets.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      res.json({
        data: page,
        nextCursor:
          rows.length > limit && page.length
            ? developerCursor(page[page.length - 1])
            : null,
      });
    },
  );
  app.get(
    "/api/v1/products",
    rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false }),
    requireDeveloperScope("products:read"),
    async (req, res) => {
      const auth = developerAuth(req)!;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const cursor = parseDeveloperCursor(
        typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      );
      if (req.query.cursor && (!cursor || !/^\d+$/.test(cursor.id)))
        return res
          .status(400)
          .json({
            error: { code: "invalid_cursor", message: "The cursor is invalid" },
          });
      const rows = await db
        .select({
          id: products.id,
          title: products.title,
          description: products.description,
          price: products.price,
          productType: products.productType,
          status: products.status,
          createdAt: products.createdAt,
        })
        .from(products)
        .where(
          and(
            eq(products.businessId, auth.businessId),
            cursor
              ? or(
                  lt(products.createdAt, cursor.createdAt),
                  and(
                    eq(products.createdAt, cursor.createdAt),
                    lt(products.id, Number(cursor.id)),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(products.createdAt), desc(products.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      res.json({
        data: page,
        nextCursor:
          rows.length > limit && page.length
            ? developerCursor(page[page.length - 1])
            : null,
      });
    },
  );
  app.get(
    "/api/v1/analytics/summary",
    rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false }),
    requireDeveloperScope("analytics:read"),
    async (req, res) => {
      const auth = developerAuth(req)!;
      const rows = await db
        .select({
          eventType: analyticsEvents.eventName,
          count: sql<number>`count(*)`,
        })
        .from(analyticsEvents)
        .where(eq(analyticsEvents.businessId, auth.businessId))
        .groupBy(analyticsEvents.eventName)
        .orderBy(desc(sql`count(*)`));
      res.json({
        data: rows.map((row) => ({ ...row, count: Number(row.count) })),
      });
    },
  );
}
