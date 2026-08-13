import { afterEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { directUploadStorageKey, assetStorageReadiness, materializePrivateAsset, persistPrivateBuffer, persistUpload } from "../server/asset-storage";
import { monthlyAssetQuotaFor, normalizeAssetVisibility, validateAssetUpload } from "../server/asset-policy";
import { apiRateLimiter, assetUploadRateLimiter, securityHeaders } from "../server/security";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("production safety boundaries", () => {
  it("applies browser isolation and transport headers", () => {
    process.env.NODE_ENV = "production";
    const headers = new Map<string, string>();
    let called = false;
    securityHeaders({} as never, { setHeader: (key: string, value: string) => headers.set(key, value) } as never, () => { called = true; });
    expect(called).toBe(true);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy")).toContain("https://clerk.creativesos.net");
    expect(headers.get("Content-Security-Policy")).toContain("https://accounts.creativesos.net");
    expect(headers.get("Content-Security-Policy")).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });

  it("allows the Vite development preamble without weakening production CSP", () => {
    process.env.NODE_ENV = "development";
    const headers = new Map<string, string>();
    securityHeaders({} as never, { setHeader: (key: string, value: string) => headers.set(key, value) } as never, () => undefined);
    expect(headers.get("Content-Security-Policy")).toContain("script-src 'self' 'unsafe-inline'");
    expect(headers.has("Strict-Transport-Security")).toBe(false);
  });

  it("throttles repeated API calls while leaving health checks alone", () => {
    const limiter = apiRateLimiter({ max: 1, windowMs: 60_000 });
    const response = () => {
      const state = { statusCode: 0, body: undefined as unknown, retryAfter: undefined as string | undefined };
      return {
        state,
        setHeader: (key: string, value: string) => { if (key === "Retry-After") state.retryAfter = value; },
        status: (code: number) => ({ json: (body: unknown) => { state.statusCode = code; state.body = body; } }),
      };
    };
    const request = { path: "/api/posts", ip: "203.0.113.10" } as never;
    let nextCount = 0;
    limiter(request, response() as never, () => { nextCount += 1; });
    const blocked = response();
    limiter(request, blocked as never, () => { nextCount += 1; });
    limiter({ path: "/api/health", ip: "203.0.113.10" } as never, response() as never, () => { nextCount += 1; });
    expect(nextCount).toBe(2);
    expect(blocked.state.statusCode).toBe(429);
    expect(blocked.state.retryAfter).toBeDefined();
  });

  it("keeps local assets development-only and records provider-neutral paths", async () => {
    process.env.NODE_ENV = "development";
    process.env.ASSET_STORAGE_PROVIDER = "local";
    expect(assetStorageReadiness()).toEqual({ provider: "local", configured: true });
    await expect(persistUpload({ filename: "image-123.png" } as Express.Multer.File, 42, "photo"))
      .resolves.toEqual({ storageKey: "uploads/image-123.png", publicUrl: "/uploads/image-123.png" });
  });

  it("keeps development private assets inside the configured managed directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-assets-"));
    process.env.NODE_ENV = "development";
    process.env.ASSET_STORAGE_PROVIDER = "local";
    process.env.CREATOROS_UPLOAD_DIR = root;
    try {
      const stored = await persistPrivateBuffer({
        body: Buffer.from("private broadcast qualification"),
        ownerUserId: 42,
        kind: "broadcast",
        filename: "qualification.mp4",
        mimeType: "video/mp4",
      });
      const expected = path.resolve(root, stored.storageKey);
      expect(expected.startsWith(`${path.resolve(root)}${path.sep}`)).toBe(true);
      await expect(fs.readFile(expected, "utf8")).resolves.toBe("private broadcast qualification");

      const materialized = path.join(root, "materialized.mp4");
      await materializePrivateAsset(stored.storageKey, materialized);
      await expect(fs.readFile(materialized, "utf8")).resolves.toBe("private broadcast qualification");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("enforces visibility, type, size, and conservative monthly asset quotas", () => {
    expect(normalizeAssetVisibility("private")).toBe("private");
    expect(normalizeAssetVisibility("published")).toBeNull();
    expect(validateAssetUpload({ kind: "profile", mimeType: "image/png", sizeBytes: 1_024, visibility: "public" })).toBeNull();
    expect(validateAssetUpload({ kind: "profile", mimeType: "application/pdf", sizeBytes: 1_024, visibility: "public" })).toMatch(/not allowed/i);
    expect(validateAssetUpload({ kind: "video", mimeType: "video/mp4", sizeBytes: 251 * 1024 * 1024, visibility: "private" })).toMatch(/exceeds/i);
    expect(validateAssetUpload({ kind: "cut-lut", mimeType: "text/plain", sizeBytes: 2_048, visibility: "private" })).toBeNull();
    expect(validateAssetUpload({ kind: "cut-lut", mimeType: "text/html", sizeBytes: 2_048, visibility: "private" })).toMatch(/not allowed/i);
    expect(monthlyAssetQuotaFor("video").maxAssets).toBeLessThan(monthlyAssetQuotaFor("photo").maxAssets);
  });

  it("uses unguessable, environment-scoped keys for direct uploads", () => {
    process.env.NODE_ENV = "production";
    const first = directUploadStorageKey(42, "profile", "headshot.png", "public");
    const second = directUploadStorageKey(42, "profile", "headshot.png", "public");
    expect(first).toMatch(/^creativesos\/production\/public\/users\/42\/profile\/.+\.png$/);
    expect(first).not.toBe(second);
  });

  it("throttles upload attempts per authenticated account", () => {
    const limiter = assetUploadRateLimiter({ max: 1, windowMs: 60_000 });
    const response = () => {
      const state = { statusCode: 0 };
      return {
        state,
        setHeader: () => undefined,
        status: (code: number) => ({ json: () => { state.statusCode = code; } }),
      };
    };
    const request = { path: "/api/assets/upload-intents", ip: "203.0.113.10", dbUser: { id: 42 } } as never;
    let nextCount = 0;
    limiter(request, response() as never, () => { nextCount += 1; });
    const blocked = response();
    limiter(request, blocked as never, () => { nextCount += 1; });
    expect(nextCount).toBe(1);
    expect(blocked.state.statusCode).toBe(429);
  });
});
