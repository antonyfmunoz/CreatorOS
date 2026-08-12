import 'dotenv/config'
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { scheduleCleanupTasks } from "./cleanup";
import { scheduleDistributionProcessing } from "./distribution";
import { scheduleUmhDelivery } from "./umh";
import { scheduleAutomationProcessing } from "./automation-engine";
import { scheduleRelationshipHubProcessing } from "./relationship-hub";
import { scheduleInstagramRelationshipTokenRefresh } from "./relationship-instagram-oauth";
import { scheduleXRelationshipTokenRefresh } from "./relationship-x-oauth";
import { scheduleStripeCommerceRecovery } from "./stripe";
import { apiRateLimiter, sameOriginMutationGuard, securityHeaders } from "./security";

const app = express();
if (process.env.CREATOROS_QUALIFICATION_MODE === "true" && process.env.QUALIFICATION_ISOLATED_DATABASE !== "true") {
  throw new Error("CREATOROS_QUALIFICATION_MODE requires QUALIFICATION_ISOLATED_DATABASE=true");
}
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(sameOriginMutationGuard);
app.use(apiRateLimiter());
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, body) => {
    (req as Request).rawBody = Buffer.from(body);
  },
}));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Serve uploaded files
const uploadDirectory = process.env.CREATOROS_UPLOAD_DIR
  ? path.resolve(process.env.CREATOROS_UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadDirectory, {
  fallthrough: false,
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");
  },
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Unhandled request error:", err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on PORT (defaults to 3000). This serves both the API and the
  // client from a single process/port, which is what Fly.io routes to.
  const port = process.env.PORT || 3000;
  server.listen({
  port,
  host: "0.0.0.0",
}, () => {
    log(`serving on port ${port}`);

    // Demo mode is intentionally self-contained. Starting any database- or
    // provider-backed worker here makes local browser qualification depend on
    // ambient credentials and can mutate a developer's real environment.
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
    log("background workers scheduled");
  });
})();
