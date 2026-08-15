import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { scheduleCleanupTasks } from "./cleanup";
import { scheduleDistributionProcessing } from "./distribution";
import { scheduleUmhDelivery } from "./umh";
import { scheduleAutomationProcessing } from "./automation-engine";
import { scheduleRelationshipHubProcessing } from "./relationship-hub";
import { scheduleInstagramRelationshipTokenRefresh } from "./relationship-instagram-oauth";
import { scheduleXRelationshipTokenRefresh } from "./relationship-x-oauth";
import { scheduleStripeCommerceRecovery } from "./stripe";
import { apiRateLimiter, sameOriginMutationGuard, securityHeaders } from "./security";
import { captureServerException, requestObservability, structuredLog } from "./observability";
import { closeDatabase } from "./db";
import { shutdownPostHog } from "./posthog";
import { scheduleBroadcastRecovery } from "./broadcast-studio";
import { scheduleMediaCloudProcessing } from "./media-processing";
import { scheduleDeveloperWebhookProcessing } from "./developer-platform";
import { operationalRequestTelemetry } from "./operations";

const app = express();
if (process.env.CREATOROS_QUALIFICATION_MODE === "true" && process.env.QUALIFICATION_ISOLATED_DATABASE !== "true") {
  throw new Error("CREATOROS_QUALIFICATION_MODE requires QUALIFICATION_ISOLATED_DATABASE=true");
}
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(sameOriginMutationGuard);
app.use(apiRateLimiter());
app.use(requestObservability);
app.use(operationalRequestTelemetry);
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, body) => {
    (req as Request).rawBody = Buffer.from(body);
  },
}));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const uploadDirectory = process.env.CREATOROS_UPLOAD_DIR
  ? path.resolve(process.env.CREATOROS_UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadDirectory, {
  fallthrough: false,
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");
  },
}));

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    captureServerException(err, { requestId: res.locals.requestId, statusCode: status });
    const message = status >= 500 ? "Internal Server Error" : err.message || "Request failed";
    res.status(status).json({ message, requestId: res.locals.requestId });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT || 3000;
  server.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);

    // Qualification modes are self-contained. Starting ambient workers here
    // could mutate a developer's real provider or production environment.
    if (process.env.CREATOROS_DEMO_MODE === "true" || process.env.CREATOROS_QUALIFICATION_MODE === "true") {
      log("local qualification mode: background workers disabled");
      return;
    }

    scheduleCleanupTasks();
    scheduleDistributionProcessing();
    scheduleUmhDelivery();
    scheduleAutomationProcessing();
    scheduleRelationshipHubProcessing();
    scheduleInstagramRelationshipTokenRefresh();
    scheduleXRelationshipTokenRefresh();
    scheduleStripeCommerceRecovery();
    scheduleBroadcastRecovery();
    scheduleMediaCloudProcessing();
    scheduleDeveloperWebhookProcessing();
    log("background workers scheduled");
  });

  let shuttingDown = false;
  const shutdown = async (signal: string, error?: unknown) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (error) captureServerException(error, { signal, fatal: true });
    else structuredLog("info", "server.shutdown", { signal });
    const forcedExit = setTimeout(() => process.exit(1), 15_000);
    forcedExit.unref();
    server.close(async (closeError) => {
      if (closeError) captureServerException(closeError, { signal, phase: "http_close" });
      await Promise.allSettled([closeDatabase(), shutdownPostHog()]);
      clearTimeout(forcedExit);
      process.exit(error || closeError ? 1 : 0);
    });
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("uncaughtException", (error) => void shutdown("uncaughtException", error));
  process.once("unhandledRejection", (error) => void shutdown("unhandledRejection", error));
})();
