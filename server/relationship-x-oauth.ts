import crypto from "node:crypto";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { db } from "./db";
import { relationshipChannelConnections, socialOAuthStates } from "../shared/schema";
import { createSocialOAuthState, decryptSocialToken, encryptSocialToken, hashSocialOAuthState } from "./social-oauth";
import { xRelationshipAdapter, xRelationshipCapabilities } from "./relationship-x-adapter";

export const xRelationshipScopes = ["dm.read", "dm.write", "tweet.read", "users.read", "offline.access"] as const;

function xClientId() {
  const value = process.env.X_CLIENT_ID;
  if (!value) throw new Error("X_CLIENT_ID is not configured");
  return value;
}

function xClientSecret() {
  const value = process.env.X_CLIENT_SECRET;
  if (!value) throw new Error("X_CLIENT_SECRET is not configured");
  return value;
}

function xApiSecret() {
  const value = process.env.X_API_SECRET;
  if (!value) throw new Error("X_API_SECRET is not configured");
  return value;
}

function codeVerifier(state: string) {
  return crypto.createHmac("sha256", xClientSecret()).update(`creativesos:x:pkce:${state}`).digest("base64url");
}

function codeChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function tokenAuthorization() {
  return `Basic ${Buffer.from(`${xClientId()}:${xClientSecret()}`).toString("base64")}`;
}

export function xRelationshipRedirectUri() {
  if (!process.env.PUBLIC_APP_URL) throw new Error("PUBLIC_APP_URL is not configured");
  return new URL("/api/relationship-hub/connections/x/callback", process.env.PUBLIC_APP_URL).toString();
}

export function xRelationshipConfiguration() {
  return {
    configured: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && process.env.X_API_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.PUBLIC_APP_URL),
    requiredScopes: [...xRelationshipScopes],
    webhookPathTemplate: "/api/relationship-hub/webhooks/x/:connectionId",
    pollingFallback: true,
  };
}

export async function createXRelationshipAuthorization(input: { userId: number; businessId: string }) {
  const state = createSocialOAuthState();
  await db.insert(socialOAuthStates).values({ userId: input.userId, provider: `relationship:x:${input.businessId}`, stateHash: state.hash, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", xClientId());
  url.searchParams.set("redirect_uri", xRelationshipRedirectUri());
  url.searchParams.set("scope", xRelationshipScopes.join(" "));
  url.searchParams.set("state", state.value);
  url.searchParams.set("code_challenge", codeChallenge(codeVerifier(state.value)));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function consumeState(input: { state: string; userId: number }) {
  const [stored] = await db.select().from(socialOAuthStates).where(and(
    eq(socialOAuthStates.stateHash, hashSocialOAuthState(input.state)),
    eq(socialOAuthStates.userId, input.userId),
    isNull(socialOAuthStates.consumedAt),
    gt(socialOAuthStates.expiresAt, new Date()),
  )).limit(1);
  if (!stored || !stored.provider.startsWith("relationship:x:")) throw new Error("X connection state is invalid or expired");
  const [consumed] = await db.update(socialOAuthStates).set({ consumedAt: new Date() }).where(and(eq(socialOAuthStates.id, stored.id), isNull(socialOAuthStates.consumedAt))).returning();
  if (!consumed) throw new Error("X connection state was already used");
  return stored.provider.slice("relationship:x:".length);
}

async function xJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string; error_description?: string; detail?: string };
  if (!response.ok) throw new Error(body.error_description || body.detail || body.error || `X authorization failed (${response.status})`);
  return body;
}

async function exchangeToken(parameters: URLSearchParams) {
  return xJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { authorization: tokenAuthorization(), "content-type": "application/x-www-form-urlencoded" },
    body: parameters,
  }));
}

export async function completeXRelationshipAuthorization(input: { code: string; state: string; userId: number }) {
  const businessId = await consumeState({ state: input.state, userId: input.userId });
  const token = await exchangeToken(new URLSearchParams({
    code: input.code,
    grant_type: "authorization_code",
    client_id: xClientId(),
    redirect_uri: xRelationshipRedirectUri(),
    code_verifier: codeVerifier(input.state),
  }));
  const profile = await xJson<{ data?: { id?: string; name?: string; username?: string } }>(await fetch("https://api.x.com/2/users/me?user.fields=id,name,username", { headers: { authorization: `Bearer ${token.access_token}` } }));
  const account = profile.data;
  if (!account?.id) throw new Error("X authorization did not return an account");
  const now = new Date();
  const values = {
    businessId,
    connectedByUserId: input.userId,
    provider: "x",
    providerAccountId: account.id,
    providerAccountName: account.username ? `@${account.username}` : account.name || `X ${account.id}`,
    status: "active",
    scopes: token.scope?.split(" ").filter(Boolean) ?? [...xRelationshipScopes],
    capabilities: xRelationshipAdapter.capabilities,
    accessTokenCiphertext: encryptSocialToken(token.access_token),
    refreshTokenCiphertext: token.refresh_token ? encryptSocialToken(token.refresh_token) : null,
    webhookSecretCiphertext: encryptSocialToken(xApiSecret()),
    tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1_000) : null,
    lastValidatedAt: now,
    metadata: { username: account.username ?? null, webhookMode: "reconciliation_with_optional_account_activity" },
    updatedAt: now,
  };
  const [connection] = await db.insert(relationshipChannelConnections).values(values).onConflictDoUpdate({
    target: [relationshipChannelConnections.businessId, relationshipChannelConnections.provider, relationshipChannelConnections.providerAccountId],
    set: values,
  }).returning();
  return connection;
}

export async function refreshExpiringXRelationshipTokens() {
  const candidates = await db.select().from(relationshipChannelConnections).where(and(
    eq(relationshipChannelConnections.provider, "x"),
    eq(relationshipChannelConnections.status, "active"),
    lte(relationshipChannelConnections.tokenExpiresAt, new Date(Date.now() + 15 * 60_000)),
  ));
  for (const connection of candidates) {
    try {
      if (!connection.refreshTokenCiphertext) throw new Error("X refresh token is unavailable");
      const token = await exchangeToken(new URLSearchParams({
        refresh_token: decryptSocialToken(connection.refreshTokenCiphertext),
        grant_type: "refresh_token",
        client_id: xClientId(),
      }));
      await db.update(relationshipChannelConnections).set({
        accessTokenCiphertext: encryptSocialToken(token.access_token),
        refreshTokenCiphertext: token.refresh_token ? encryptSocialToken(token.refresh_token) : connection.refreshTokenCiphertext,
        tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1_000) : connection.tokenExpiresAt,
        lastValidatedAt: new Date(), lastErrorCode: null, lastErrorMessage: null, updatedAt: new Date(),
      }).where(eq(relationshipChannelConnections.id, connection.id));
    } catch {
      await db.update(relationshipChannelConnections).set({ status: "reauthorization_required", lastErrorCode: "x_token_refresh_failed", lastErrorMessage: "X authorization must be renewed", updatedAt: new Date() }).where(eq(relationshipChannelConnections.id, connection.id));
    }
  }
}

let xTokenRefreshTimer: NodeJS.Timeout | undefined;

export function scheduleXRelationshipTokenRefresh() {
  if (xTokenRefreshTimer) return;
  const tick = () => void refreshExpiringXRelationshipTokens().catch(() => undefined);
  void tick();
  xTokenRefreshTimer = setInterval(tick, 10 * 60_000);
  xTokenRefreshTimer.unref();
}
