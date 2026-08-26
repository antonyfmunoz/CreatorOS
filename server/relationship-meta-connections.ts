import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db";
import { relationshipChannelConnections, socialOAuthStates, type RelationshipChannelConnection } from "../shared/schema";
import { createSocialOAuthState, decryptSocialToken, encryptSocialToken, hashSocialOAuthState, isSocialTokenEncryptionConfigured } from "./social-oauth";
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

function publicAppUrlConfigured() {
  try {
    const url = new URL(process.env.PUBLIC_APP_URL || "");
    return url.protocol === "https:" || url.hostname === "localhost";
  } catch {
    return false;
  }
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
  return Boolean(
    (process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID)
    && (process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET)
    && /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION || "")
    && verifyToken()
    && isSocialTokenEncryptionConfigured()
    && publicAppUrlConfigured(),
  );
}

export function messengerRelationshipConfiguration() {
  return { configured: Boolean(baseConfiguration() && (process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID)), requiredScopes: [...messengerRelationshipScopes], webhookPath: "/api/relationship-hub/webhooks/messenger" };
}

export function whatsappRelationshipConfiguration() {
  return {
    configured: baseConfiguration(),
    connectionMode: process.env.META_WHATSAPP_CONFIG_ID ? "embedded_signup" as const : "system_user_token" as const,
    embeddedSignupConfigured: Boolean(baseConfiguration() && process.env.META_WHATSAPP_CONFIG_ID),
    webhookPath: "/api/relationship-hub/webhooks/whatsapp",
    requiredScopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
  };
}

export async function createWhatsAppEmbeddedSignupSession(input: { userId: number; businessId: string }) {
  if (!baseConfiguration() || !process.env.META_WHATSAPP_CONFIG_ID) {
    throw new Error("WhatsApp Embedded Signup is not configured");
  }
  const state = createSocialOAuthState();
  await db.insert(socialOAuthStates).values({
    userId: input.userId,
    provider: `relationship:whatsapp:${input.businessId}`,
    stateHash: state.hash,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return {
    state: state.value,
    appId: appId(),
    configId: process.env.META_WHATSAPP_CONFIG_ID,
    graphVersion: graphVersion(),
  };
}

async function consumeWhatsAppState(input: { state: string; userId: number }) {
  const [stored] = await db.select().from(socialOAuthStates).where(and(
    eq(socialOAuthStates.stateHash, hashSocialOAuthState(input.state)),
    eq(socialOAuthStates.userId, input.userId),
    isNull(socialOAuthStates.consumedAt),
    gt(socialOAuthStates.expiresAt, new Date()),
  )).limit(1);
  if (!stored || !stored.provider.startsWith("relationship:whatsapp:")) {
    throw new Error("WhatsApp connection state is invalid or expired");
  }
  const [consumed] = await db.update(socialOAuthStates).set({ consumedAt: new Date() }).where(and(
    eq(socialOAuthStates.id, stored.id),
    isNull(socialOAuthStates.consumedAt),
  )).returning();
  if (!consumed) throw new Error("WhatsApp connection state was already used");
  return stored.provider.slice("relationship:whatsapp:".length);
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

export async function metaPaged<T>(url: URL, init?: RequestInit, maxPages = 20) {
  const items: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const pageUrl = new URL(url);
    if (after) pageUrl.searchParams.set("after", after);
    const response = await metaJson<{ data?: T[]; paging?: { cursors?: { after?: string } } }>(await fetch(pageUrl, init));
    items.push(...(response.data ?? []));
    const next = response.paging?.cursors?.after;
    if (!next || next === after || !(response.data?.length)) break;
    after = next;
  }
  return items;
}

export async function completeMessengerRelationshipAuthorization(input: { code: string; state: string; userId: number }) {
  const businessId = await consumeMessengerState({ state: input.state, userId: input.userId });
  const tokenUrl = new URL(graphUrl("/oauth/access_token"));
  tokenUrl.searchParams.set("client_id", appId()); tokenUrl.searchParams.set("client_secret", appSecret()); tokenUrl.searchParams.set("redirect_uri", messengerRelationshipRedirectUri()); tokenUrl.searchParams.set("code", input.code);
  const userToken = await metaJson<{ access_token: string }>(await fetch(tokenUrl));
  const pagesUrl = new URL(graphUrl("/me/accounts"));
  pagesUrl.searchParams.set("fields", "id,name,access_token,tasks"); pagesUrl.searchParams.set("limit", "100"); pagesUrl.searchParams.set("access_token", userToken.access_token);
  const pages = await metaPaged<{ id?: string; name?: string; access_token?: string; tasks?: string[] }>(pagesUrl);
  const eligible = pages.filter((page) => page.id && page.access_token && page.tasks?.some((task) => ["MESSAGING", "MODERATE", "MANAGE"].includes(task)));
  if (!eligible.length) throw new Error("No Facebook Page with messaging access was authorized");
  const connections = [];
  for (const page of eligible) {
    const subscribeUrl = new URL(graphUrl(`/${encodeURIComponent(page.id!)}/subscribed_apps`));
    subscribeUrl.searchParams.set("subscribed_fields", "messages,messaging_postbacks,message_deliveries,messaging_reads");
    subscribeUrl.searchParams.set("access_token", page.access_token!);
    const subscription = await metaJson<{ success?: boolean }>(await fetch(subscribeUrl, { method: "POST" }));
    if (subscription.success !== true) throw new Error(`Meta did not confirm the Messenger webhook subscription for ${page.name || page.id}`);
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

const whatsappRequiredScopes = ["whatsapp_business_messaging", "whatsapp_business_management"] as const;

async function inspectMetaAccessToken(accessToken: string) {
  const url = new URL(graphUrl("/debug_token"));
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId()}|${appSecret()}`);
  const result = await metaJson<{ data?: { is_valid?: boolean; app_id?: string; scopes?: string[]; granular_scopes?: Array<{ scope?: string }>; expires_at?: number; data_access_expires_at?: number } }>(await fetch(url));
  const data = result.data;
  if (!data?.is_valid) throw new Error("The Meta access token is invalid");
  if (data.app_id && data.app_id !== appId()) throw new Error("The Meta access token belongs to a different app");
  const scopes = new Set([...(data.scopes ?? []), ...(data.granular_scopes ?? []).flatMap((item) => item.scope ? [item.scope] : [])]);
  const missing = whatsappRequiredScopes.filter((scope) => !scopes.has(scope));
  if (missing.length) throw new Error(`The Meta access token is missing required scopes: ${missing.join(", ")}`);
  if (data.expires_at && data.expires_at * 1_000 <= Date.now()) throw new Error("The Meta access token has expired");
  return { scopes: Array.from(scopes).sort(), expiresAt: data.expires_at ? new Date(data.expires_at * 1_000) : null, dataAccessExpiresAt: data.data_access_expires_at ? new Date(data.data_access_expires_at * 1_000) : null };
}

export async function connectWhatsAppRelationshipAccount(input: { businessId: string; userId: number; phoneNumberId: string; wabaId: string; accessToken: string; accountName?: string }) {
  const token = await inspectMetaAccessToken(input.accessToken);
  const phoneNumbersUrl = new URL(graphUrl(`/${encodeURIComponent(input.wabaId)}/phone_numbers`));
  phoneNumbersUrl.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating,name_status");
  phoneNumbersUrl.searchParams.set("limit", "100");
  phoneNumbersUrl.searchParams.set("access_token", input.accessToken);
  const phoneNumbers = await metaPaged<{ id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; name_status?: string }>(phoneNumbersUrl);
  const profile = phoneNumbers.find((candidate) => candidate.id === input.phoneNumberId);
  if (!profile?.id) throw new Error("The WhatsApp phone number does not belong to the supplied WhatsApp Business Account");
  const subscribeUrl = new URL(graphUrl(`/${encodeURIComponent(input.wabaId)}/subscribed_apps`));
  const subscription = await metaJson<{ success?: boolean }>(await fetch(subscribeUrl, { method: "POST", headers: { authorization: `Bearer ${input.accessToken}` } }));
  if (subscription.success !== true) throw new Error("Meta did not confirm the WhatsApp webhook subscription");
  const now = new Date();
  const values = { businessId: input.businessId, connectedByUserId: input.userId, provider: "whatsapp", providerAccountId: profile.id, providerAccountName: input.accountName || profile.verified_name || profile.display_phone_number || `WhatsApp ${profile.id}`, status: "active", scopes: [...whatsappRequiredScopes], capabilities: whatsappRelationshipAdapter.capabilities, accessTokenCiphertext: encryptSocialToken(input.accessToken), webhookSecretCiphertext: encryptSocialToken(appSecret()), tokenExpiresAt: token.expiresAt, lastValidatedAt: now, metadata: { wabaId: input.wabaId, displayPhoneNumber: profile.display_phone_number ?? null, qualityRating: profile.quality_rating ?? null, nameStatus: profile.name_status ?? null, grantedScopes: token.scopes, dataAccessExpiresAt: token.dataAccessExpiresAt?.toISOString() ?? null, webhookSubscribedAt: now.toISOString(), webhookCallbackUrl: new URL("/api/relationship-hub/webhooks/whatsapp", process.env.PUBLIC_APP_URL!).toString() }, updatedAt: now };
  return withRelationshipConnectionCapacity({ businessId: input.businessId, provider: "whatsapp", providerAccountId: profile.id }, async (tx) => {
    const [connection] = await tx.insert(relationshipChannelConnections).values(values).onConflictDoUpdate({ target: [relationshipChannelConnections.businessId, relationshipChannelConnections.provider, relationshipChannelConnections.providerAccountId], set: values }).returning();
    return connection;
  });
}

export async function completeWhatsAppEmbeddedSignup(input: {
  userId: number;
  state: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
}) {
  const businessId = await consumeWhatsAppState({ state: input.state, userId: input.userId });
  const tokenUrl = new URL(graphUrl("/oauth/access_token"));
  tokenUrl.searchParams.set("client_id", appId());
  tokenUrl.searchParams.set("client_secret", appSecret());
  tokenUrl.searchParams.set("code", input.code);
  const token = await metaJson<{ access_token?: string }>(await fetch(tokenUrl));
  if (!token.access_token) throw new Error("Meta did not return a WhatsApp access token");
  return connectWhatsAppRelationshipAccount({
    businessId,
    userId: input.userId,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    accessToken: token.access_token,
  });
}

export async function listWhatsAppRelationshipTemplates(connection: RelationshipChannelConnection) {
  if (connection.provider !== "whatsapp" || !connection.accessTokenCiphertext) throw new Error("WhatsApp connection is not active");
  const wabaId = typeof connection.metadata.wabaId === "string" ? connection.metadata.wabaId : "";
  if (!wabaId) throw new Error("WhatsApp Business Account ID is unavailable");
  const url = new URL(graphUrl(`/${encodeURIComponent(wabaId)}/message_templates`));
  url.searchParams.set("fields", "id,name,status,category,language,components");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", decryptSocialToken(connection.accessTokenCiphertext));
  const templates = await metaPaged<{ id?: string; name?: string; status?: string; category?: string; language?: string; components?: Array<Record<string, unknown>> }>(url);
  return templates.filter((template) => template.id && template.name && template.language).map((template) => ({
    id: template.id!,
    name: template.name!,
    status: template.status ?? "UNKNOWN",
    category: template.category ?? "UNKNOWN",
    language: template.language!,
    components: template.components ?? [],
  }));
}
