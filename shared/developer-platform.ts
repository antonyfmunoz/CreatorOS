import { z } from "zod";

export const developerApiScopes = [
  "profile:read",
  "assets:read",
  "products:read",
  "analytics:read",
] as const;

export const developerWebhookEventTypes = [
  "asset.ready",
  "content.published",
  "product.updated",
  "order.completed",
  "relationship.updated",
  "test.ping",
] as const;

export const createDeveloperApiKeySchema = z.object({
  name: z.string().trim().min(2).max(100),
  scopes: z
    .array(z.enum(developerApiScopes))
    .min(1)
    .max(developerApiScopes.length),
  expiresAt: z.coerce
    .date()
    .min(new Date(Date.now() + 60_000))
    .optional(),
});

export const createDeveloperWebhookSchema = z.object({
  name: z.string().trim().min(2).max(100),
  url: z.string().url().max(2_000),
  events: z
    .array(z.enum(developerWebhookEventTypes))
    .min(1)
    .max(developerWebhookEventTypes.length),
});

export const createDeveloperOAuthAppSchema = z.object({
  name: z.string().trim().min(2).max(100),
  redirectUris: z.array(z.string().url().max(2_000)).min(1).max(10),
  scopes: z.array(z.enum(developerApiScopes)).min(1).max(developerApiScopes.length),
});

export const oauthAuthorizationSchema = z.object({
  clientId: z.string().trim().min(12).max(160),
  redirectUri: z.string().url().max(2_000),
  scopes: z.array(z.enum(developerApiScopes)).min(1).max(developerApiScopes.length),
  state: z.string().max(500).default(""),
});

export const developerAppListingSchema = z.object({
  description: z.string().trim().min(20).max(1_000),
  homepageUrl: z.string().url().max(2_000),
  privacyUrl: z.string().url().max(2_000),
  termsUrl: z.string().url().max(2_000),
});

export const developerAppReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().min(3).max(1_000),
});

export function isSafeWebhookUrl(value: string, allowLocal = false) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (
      allowLocal &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    )
      return true;
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      /^(10|127)\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

export function developerCursor(input: {
  createdAt: Date | string;
  id: string | number;
}) {
  return Buffer.from(
    `${new Date(input.createdAt).toISOString()}|${input.id}`,
    "utf8",
  ).toString("base64url");
}

export function parseDeveloperCursor(value: string | undefined) {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (
      separator < 1 ||
      Number.isNaN(createdAt.valueOf()) ||
      (!z.string().uuid().safeParse(id).success && !/^\d+$/.test(id))
    )
      return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
