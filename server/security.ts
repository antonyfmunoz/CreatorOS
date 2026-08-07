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
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}
