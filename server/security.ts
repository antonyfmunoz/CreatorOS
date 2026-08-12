import type { NextFunction, Request, Response } from "express";

const ONE_MINUTE_MS = 60_000;

type Window = { startedAt: number; count: number };

/**
 * Dependency-free first-line abuse control. Cloudflare's edge policy should
 * remain the authoritative distributed limiter when it is configured.
 */
export function apiRateLimiter(options: { windowMs?: number; max?: number } = {}) {
  const windowMs = options.windowMs ?? ONE_MINUTE_MS;
  const max = options.max ?? 240;
  const windows = new Map<string, Window>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/") || req.path === "/api/health" || req.path === "/api/ready" || req.path === "/api/stripe/webhook") return next();

    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = windows.get(key);
    const window = !current || now - current.startedAt >= windowMs ? { startedAt: now, count: 0 } : current;
    window.count += 1;
    windows.set(key, window);

    if (window.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - window.startedAt)) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ message: "Too many requests. Please try again shortly." });
    }

    if (windows.size > 10_000) {
      Array.from(windows.entries()).forEach(([candidate, value]) => {
        if (now - value.startedAt >= windowMs) windows.delete(candidate);
      });
    }
    next();
  };
}

/**
 * Uploads are a materially different abuse and cost surface than ordinary API
 * reads. This local limiter is deliberately conservative; Cloudflare edge
 * rules remain the distributed control when configured.
 */
export function assetUploadRateLimiter(options: { windowMs?: number; max?: number } = {}) {
  const windowMs = options.windowMs ?? 60 * 60 * 1_000;
  const max = options.max ?? 30;
  const windows = new Map<string, Window>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `asset:${req.dbUser?.id ?? req.ip}`;
    const current = windows.get(key);
    const window = !current || now - current.startedAt >= windowMs ? { startedAt: now, count: 0 } : current;
    window.count += 1;
    windows.set(key, window);

    if (window.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - window.startedAt)) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ message: "Upload limit reached. Please try again later." });
    }

    if (windows.size > 10_000) {
      Array.from(windows.entries()).forEach(([candidate, value]) => {
        if (now - value.startedAt >= windowMs) windows.delete(candidate);
      });
    }
    next();
  };
}

export function automationMutationRateLimiter(options: { windowMs?: number; max?: number } = {}) {
  const windowMs = options.windowMs ?? ONE_MINUTE_MS;
  const max = options.max ?? 60;
  const windows = new Map<string, Window>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `automation:${req.dbUser?.id ?? req.ip}`;
    const current = windows.get(key);
    const window = !current || now - current.startedAt >= windowMs ? { startedAt: now, count: 0 } : current;
    window.count += 1;
    windows.set(key, window);
    if (window.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - window.startedAt)) / 1_000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ message: "Automation action limit reached. Please try again shortly." });
    }
    if (windows.size > 10_000) {
      Array.from(windows.entries()).forEach(([candidate, value]) => {
        if (now - value.startedAt >= windowMs) windows.delete(candidate);
      });
    }
    next();
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === "production";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.creativesos.net https://*.clerk.accounts.dev https://connect.stripe.com https://checkout.stripe.com",
    `script-src 'self'${isProduction ? "" : " 'unsafe-inline'"} https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com https://checkout.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; "));
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

const originExemptPaths = [
  "/api/stripe/webhook",
  "/api/relationship-hub/webhooks/",
  "/api/community-room-media/transcripts",
  "/api/umh/commands",
];

export function mutationOriginAllowed(input: {
  method: string;
  origin?: string;
  path: string;
  publicAppUrl?: string;
  production?: boolean;
}) {
  if (["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase())) return true;
  if (originExemptPaths.some((candidate) => input.path === candidate || input.path.startsWith(candidate))) return true;
  if (!input.origin) return true;
  const allowed = new Set<string>();
  if (input.publicAppUrl) allowed.add(input.publicAppUrl.replace(/\/$/, ""));
  if (!input.production) {
    allowed.add("http://localhost:3000");
    allowed.add("http://localhost:5000");
    allowed.add("http://127.0.0.1:3000");
    allowed.add("http://127.0.0.1:5000");
  }
  return allowed.has(input.origin.replace(/\/$/, ""));
}

/**
 * Browser mutations must originate from the configured first-party app.
 * Signed webhooks and server-to-server calls either use their dedicated
 * signature contract or omit Origin and remain unaffected.
 */
export function sameOriginMutationGuard(req: Request, res: Response, next: NextFunction) {
  if (mutationOriginAllowed({
    method: req.method,
    origin: req.get("origin") ?? undefined,
    path: req.path,
    publicAppUrl: process.env.PUBLIC_APP_URL,
    production: process.env.NODE_ENV === "production",
  })) return next();
  return res.status(403).json({ message: "Cross-site mutation blocked" });
}
