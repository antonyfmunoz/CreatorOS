import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db";
import { relationshipChannelConnections, socialOAuthStates } from "../shared/schema";
import { createSocialOAuthState, encryptSocialToken, hashSocialOAuthState } from "./social-oauth";
import { messengerRelationshipAdapter, whatsappRelationshipAdapter, verifyMetaWebhookChallenge } from "./relationship-meta-adapters";
import { withRelationshipConnectionCapacity } from "./relationship-operations";

export const messengerRelationshipScopes = ["public_profile", "pages_show_list", "pages_messaging", "pages_manage_metadata"] as const;

function appId() {
  const value = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID;
  if (!value) throw new Error("META_APP_ID is not configured");
  return value;
}

function appSecret() {
  const value = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (!value) throw new Error("META_APP_SECRET is not configured");
  return value;
}

function graphVersion() {
  const value = process.env.META_GRAPH_API_VERSION;
  if (!value || !/^v\d+\.\d+$/.test(value)) throw new Error("META_GRAPH_API_VERSION is not configured");
  return value;
}

function graphBase() {
  return (process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");
}

function graphUrl(path: string) {
  return `${graphBase()}/${graphVersion()}${path}`;
}

function verifyToken() {
  return process.env.RELATIONSHIP_META_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
}

export function metaWebhookChallenge(input: { mode?: string; token?: string; challenge?: string }) {
  return verifyMetaWebhookChallenge(input, verifyToken());
}

function baseConfiguration() {
  return Boolean((process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET) && process.env.META_GRAPH_API_VERSION && verifyToken() && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.PUBLIC_APP_URL);
}

export function messengerRelationshipConfiguration() {
  return { configured: Boolean(baseConfiguration() && (process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID)), requiredScopes: [...messengerRelationshipScopes], webhookPath: "/api/relationship-hub/webhooks/messenger" };
}

export function whatsappRelationshipConfiguration() {
  return { configured: baseConfiguration(), connectionMode: "system_user_token" as const, webhookPath: "/api/relationship-hub/webhooks/whatsapp" };
}

export function messengerRelationshipRedirectUri() {
  if (!process.env.PUBLIC_APP_URL) throw new Error("PUBLIC_APP_URL is not configured");
  return new URL("/api/relationship-hub/connections/messenger/callback", process.env.PUBLIC_APP_URL).toString();
}

export async function createMessengerRelationshipAuthorization(input: { userId: number; businessId: string }) {
  const state = createSocialOAuthState();
  await db.insert(socialOAuthStates).values({ userId: input.userId, provider: `relationship:messenger:${input.businessId}`, stateHash: state.hash, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId());
  url.searchParams.set("redirect_uri", messengerRelationshipRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", messengerRelationshipScopes.join(","));
  url.searchParams.set("state", state.value);
  return url.toString();
}

async function consumeMessengerState(input: { state: string; userId: number }) {
  const [stored] = await db.select().from(socialOAuthStates).where(and(eq(socialOAuthStates.stateHash, hashSocialOAuthState(input.state)), eq(socialOAuthStates.userId, input.userId), isNull(socialOAuthStates.consumedAt), gt(socialOAuthStates.expiresAt, new Date()))).limit(1);
  if (!stored || !stored.provider.startsWith("relationship:messenger:")) throw new Error("Messenger connection state is invalid or expired");
  const [consumed] = await db.update(socialOAuthStates).set({ consumedAt: new Date() }).where(and(eq(socialOAuthStates.id, stored.id), isNull(socialOAuthStates.consumedAt))).returning();
  if (!consumed) throw new Error("Messenger connection state was already used");
  return stored.provider.slice("relationship:messenger:".length);
}

async function metaJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Meta authorization failed (${response.status})`);
  return body;
}

export async function completeMessengerRelationshipAuthorization(input: { code: string; state: string; userId: number }) {
  const businessId = await consumeMessengerState({ state: input.state, userId: input.userId });
  const tokenUrl = new URL(graphUrl("/oauth/access_token"));
  tokenUrl.searchParams.set("client_id", appId()); tokenUrl.searchParams.set("client_secret", appSecret()); tokenUrl.searchParams.set("redirect_uri", messengerRelationshipRedirectUri()); tokenUrl.searchParams.set("code", input.code);
  const userToken = await metaJson<{ access_token: string }>(await fetch(tokenUrl));
  const pagesUrl = new URL(graphUrl("/me/accounts"));
  pagesUrl.searchParams.set("fields", "id,name,access_token,tasks"); pagesUrl.searchParams.set("limit", "100"); pagesUrl.searchParams.set("access_token", userToken.access_token);
  const pages = await metaJson<{ data?: Array<{ id?: string; name?: string; access_token?: string; tasks?: string[] }> }>(await fetch(pagesUrl));
  const eligible = (pages.data ?? []).filter((page) => page.id && page.access_token && page.tasks?.some((task) => ["MESSAGING", "MODERATE", "MANAGE"].includes(task)));
  if (!eligible.length) throw new Error("No Facebook Page with messaging access was authorized");
  const connections = [];
  for (const page of eligible) {
    const subscribeUrl = new URL(graphUrl(`/${encodeURIComponent(page.id!)}/subscribed_apps`));
    subscribeUrl.searchParams.set("subscribed_fields", "messages,messaging_postbacks,message_deliveries,messaging_reads");
    subscribeUrl.searchParams.set("access_token", page.access_token!);
    await metaJson(await fetch(subscribeUrl, { method: "POST" }));
    const now = new Date();
    const values = { businessId, connectedByUserId: input.userId, provider: "messenger", providerAccountId: page.id!, providerAccountName: page.name || `Facebook Page ${page.id}`, status: "active", scopes: [...messengerRelationshipScopes], capabilities: messengerRelationshipAdapter.capabilities, accessTokenCiphertext: encryptSocialToken(page.access_token!), webhookSecretCiphertext: encryptSocialToken(appSecret()), lastValidatedAt: now, metadata: { pageTasks: page.tasks ?? [], webhookCallbackUrl: new URL("/api/relationship-hub/webhooks/messenger", process.env.PUBLIC_APP_URL!).toString() }, updatedAt: now };
    const connection = await withRelationshipConnectionCapacity({ businessId, provider: "messenger", providerAccountId: page.id! }, async (tx) => {
      const [stored] = await tx.insert(relationshipChannelConnections).values(values).onConflictDoUpdate({ target: [relationshipChannelConnections.businessId, relationshipChannelConnections.provider, relationshipChannelConnections.providerAccountId], set: values }).returning();
      return stored;
    });
    connections.push(connection);
  }
  return connections;
}

export async function connectWhatsAppRelationshipAccount(input: { businessId: string; userId: number; phoneNumberId: string; wabaId?: string; accessToken: string; accountName?: string }) {
  const profileUrl = new URL(graphUrl(`/${encodeURIComponent(input.phoneNumberId)}`));
  profileUrl.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
  profileUrl.searchParams.set("access_token", input.accessToken);
  const profile = await metaJson<{ id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }>(await fetch(profileUrl));
  if (!profile.id || profile.id !== input.phoneNumberId) throw new Error("WhatsApp phone number authorization could not be verified");
  const now = new Date();
  const values = { businessId: input.businessId, connectedByUserId: input.userId, provider: "whatsapp", providerAccountId: profile.id, providerAccountName: input.accountName || profile.verified_name || profile.display_phone_number || `WhatsApp ${profile.id}`, status: "active", scopes: ["whatsapp_business_messaging", "whatsapp_business_management"], capabilities: whatsappRelationshipAdapter.capabilities, accessTokenCiphertext: encryptSocialToken(input.accessToken), webhookSecretCiphertext: encryptSocialToken(appSecret()), lastValidatedAt: now, metadata: { wabaId: input.wabaId ?? null, displayPhoneNumber: profile.display_phone_number ?? null, qualityRating: profile.quality_rating ?? null, webhookCallbackUrl: new URL("/api/relationship-hub/webhooks/whatsapp", process.env.PUBLIC_APP_URL!).toString() }, updatedAt: now };
  return withRelationshipConnectionCapacity({ businessId: input.businessId, provider: "whatsapp", providerAccountId: profile.id }, async (tx) => {
    const [connection] = await tx.insert(relationshipChannelConnections).values(values).onConflictDoUpdate({ target: [relationshipChannelConnections.businessId, relationshipChannelConnections.provider, relationshipChannelConnections.providerAccountId], set: values }).returning();
    return connection;
  });
}
