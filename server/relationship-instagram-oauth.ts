import crypto from "node:crypto";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { db } from "./db";
import { relationshipChannelConnections, socialOAuthStates } from "../shared/schema";
import { createSocialOAuthState, decryptSocialToken, encryptSocialToken, hashSocialOAuthState, isSocialTokenEncryptionConfigured } from "./social-oauth";
import { instagramRelationshipAdapter } from "./relationship-instagram-adapter";
import { withRelationshipConnectionCapacity } from "./relationship-operations";

export const instagramRelationshipScopes = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;

function instagramClientId() {
  const value = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  if (!value) throw new Error("INSTAGRAM_APP_ID is not configured");
  return value;
}

function instagramClientSecret() {
  const value = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!value) throw new Error("INSTAGRAM_APP_SECRET is not configured");
  return value;
}

function graphVersion() {
  const value = process.env.META_GRAPH_API_VERSION;
  if (!value || !/^v\d+\.\d+$/.test(value)) throw new Error("META_GRAPH_API_VERSION is not configured");
  return value;
}

export function instagramRelationshipRedirectUri() {
  const base = process.env.PUBLIC_APP_URL;
  if (!base) throw new Error("PUBLIC_APP_URL is not configured");
  return new URL("/api/relationship-hub/connections/instagram/callback", base).toString();
}

export function instagramRelationshipConfiguration() {
  const webhookVerifyToken = process.env.RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;
  let publicUrlConfigured = false;
  try {
    const url = new URL(process.env.PUBLIC_APP_URL || "");
    publicUrlConfigured = url.protocol === "https:" || url.hostname === "localhost";
  } catch {
    publicUrlConfigured = false;
  }
  return {
    configured: Boolean((process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID) && (process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET) && /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION || "") && webhookVerifyToken && isSocialTokenEncryptionConfigured() && publicUrlConfigured),
    requiredScopes: [...instagramRelationshipScopes],
    webhookPath: "/api/relationship-hub/webhooks/instagram",
  };
}

export async function createInstagramRelationshipAuthorization(input: { userId: number; businessId: string }) {
  const state = createSocialOAuthState();
  await db.insert(socialOAuthStates).values({ userId: input.userId, provider: `relationship:instagram:${input.businessId}`, stateHash: state.hash, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", instagramClientId());
  url.searchParams.set("redirect_uri", instagramRelationshipRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", instagramRelationshipScopes.join(","));
  url.searchParams.set("state", state.value);
  return url.toString();
}

async function consumeState(input: { state: string; userId: number }) {
  const hash = hashSocialOAuthState(input.state);
  const [stored] = await db.select().from(socialOAuthStates).where(and(eq(socialOAuthStates.stateHash, hash), eq(socialOAuthStates.userId, input.userId), isNull(socialOAuthStates.consumedAt), gt(socialOAuthStates.expiresAt, new Date()))).limit(1);
  if (!stored || !stored.provider.startsWith("relationship:instagram:")) throw new Error("Instagram connection state is invalid or expired");
  const [consumed] = await db.update(socialOAuthStates).set({ consumedAt: new Date() }).where(and(eq(socialOAuthStates.id, stored.id), isNull(socialOAuthStates.consumedAt))).returning();
  if (!consumed) throw new Error("Instagram connection state was already used");
  return stored.provider.slice("relationship:instagram:".length);
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string }; error_message?: string };
  if (!response.ok) throw new Error(body.error?.message || body.error_message || `Instagram authorization failed (${response.status})`);
  return body;
}

export async function completeInstagramRelationshipAuthorization(input: { code: string; state: string; userId: number }) {
  const businessId = await consumeState({ state: input.state, userId: input.userId });
  const form = new URLSearchParams({ client_id: instagramClientId(), client_secret: instagramClientSecret(), grant_type: "authorization_code", redirect_uri: instagramRelationshipRedirectUri(), code: input.code });
  const short = await jsonResponse<{ access_token: string; user_id: number }>(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form }));
  const exchange = new URL("https://graph.instagram.com/access_token");
  exchange.searchParams.set("grant_type", "ig_exchange_token");
  exchange.searchParams.set("client_secret", instagramClientSecret());
  exchange.searchParams.set("access_token", short.access_token);
  const long = await jsonResponse<{ access_token: string; expires_in?: number }>(await fetch(exchange));
  const base = `https://graph.instagram.com/${graphVersion()}`;
  const profileUrl = new URL(`${base}/me`);
  profileUrl.searchParams.set("fields", "user_id,username,name");
  profileUrl.searchParams.set("access_token", long.access_token);
  const profile = await jsonResponse<{ user_id?: string; id?: string; username?: string; name?: string }>(await fetch(profileUrl));
  const accountId = profile.user_id || profile.id || String(short.user_id);
  const subscribeUrl = new URL(`${base}/${encodeURIComponent(accountId)}/subscribed_apps`);
  subscribeUrl.searchParams.set("subscribed_fields", "comments,messages,messaging_postbacks,messaging_seen");
  subscribeUrl.searchParams.set("access_token", long.access_token);
  const subscription = await jsonResponse<{ success?: boolean }>(await fetch(subscribeUrl, { method: "POST" }));
  if (subscription.success !== true) throw new Error("Meta did not confirm the Instagram webhook subscription");
  const now = new Date();
  const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1_000) : null;
  const values = {
    businessId,
    connectedByUserId: input.userId,
    provider: "instagram",
    providerAccountId: accountId,
    providerAccountName: profile.username || profile.name || `Instagram ${accountId}`,
    status: "active",
    scopes: [...instagramRelationshipScopes],
    capabilities: instagramRelationshipAdapter.capabilities,
    accessTokenCiphertext: encryptSocialToken(long.access_token),
    tokenExpiresAt: expiresAt,
    lastValidatedAt: now,
    metadata: { apiVersion: graphVersion(), webhookCallbackUrl: new URL("/api/relationship-hub/webhooks/instagram", process.env.PUBLIC_APP_URL!).toString(), tokenKind: "long_lived_user" },
    updatedAt: now,
  };
  return withRelationshipConnectionCapacity({ businessId, provider: "instagram", providerAccountId: accountId }, async (tx) => {
    const [connection] = await tx.insert(relationshipChannelConnections).values(values).onConflictDoUpdate({
      target: [relationshipChannelConnections.businessId, relationshipChannelConnections.provider, relationshipChannelConnections.providerAccountId],
      set: values,
    }).returning();
    return connection;
  });
}

export function verifyInstagramWebhookChallenge(input: { mode?: string; token?: string; challenge?: string }) {
  const expected = process.env.RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected || input.mode !== "subscribe" || !input.token || !input.challenge) return null;
  const actual = Buffer.from(input.token);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return null;
  return input.challenge;
}

export async function refreshExpiringInstagramRelationshipTokens() {
  const candidates = await db.select().from(relationshipChannelConnections).where(and(
    eq(relationshipChannelConnections.provider, "instagram"),
    eq(relationshipChannelConnections.status, "active"),
    lte(relationshipChannelConnections.tokenExpiresAt, new Date(Date.now() + 7 * 24 * 60 * 60_000)),
  ));
  const results: Array<{ connectionId: string; status: "refreshed" | "reauthorization_required" }> = [];
  for (const connection of candidates) {
    try {
      if (!connection.accessTokenCiphertext) throw new Error("Instagram access token is unavailable");
      const refresh = new URL("https://graph.instagram.com/refresh_access_token");
      refresh.searchParams.set("grant_type", "ig_refresh_token");
      refresh.searchParams.set("access_token", decryptSocialToken(connection.accessTokenCiphertext));
      const token = await jsonResponse<{ access_token: string; expires_in: number }>(await fetch(refresh));
      await db.update(relationshipChannelConnections).set({
        accessTokenCiphertext: encryptSocialToken(token.access_token),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1_000),
        lastValidatedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      }).where(eq(relationshipChannelConnections.id, connection.id));
      results.push({ connectionId: connection.id, status: "refreshed" });
    } catch {
      await db.update(relationshipChannelConnections).set({
        status: "reauthorization_required",
        lastErrorCode: "instagram_token_refresh_failed",
        lastErrorMessage: "Instagram authorization must be renewed",
        updatedAt: new Date(),
      }).where(eq(relationshipChannelConnections.id, connection.id));
      results.push({ connectionId: connection.id, status: "reauthorization_required" });
    }
  }
  return results;
}

let instagramTokenRefreshTimer: NodeJS.Timeout | undefined;

export function scheduleInstagramRelationshipTokenRefresh() {
  if (instagramTokenRefreshTimer) return;
  const tick = () => void refreshExpiringInstagramRelationshipTokens().catch(() => undefined);
  void tick();
  instagramTokenRefreshTimer = setInterval(tick, 6 * 60 * 60_000);
  instagramTokenRefreshTimer.unref();
}
