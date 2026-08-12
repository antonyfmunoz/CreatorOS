import crypto from "node:crypto";
import type { RelationshipAdapterError, RelationshipChannelAdapter } from "./relationship-channel-adapters";
import type { NormalizedRelationshipEvent } from "./relationship-hub-policy";

type XDirectMessageEvent = {
  id?: string;
  event_type?: string;
  text?: string;
  dm_conversation_id?: string;
  created_at?: string;
  sender_id?: string;
  participant_ids?: string[];
  attachments?: { media_keys?: string[] };
};

type XPayload = {
  for_user_id?: string;
  direct_message_events?: XDirectMessageEvent[];
  data?: XDirectMessageEvent[];
  includes?: {
    users?: Array<{ id?: string; name?: string; username?: string; profile_image_url?: string; verified?: boolean }>;
    media?: Array<{ media_key?: string; type?: string; url?: string; preview_image_url?: string }>;
  };
  meta?: { next_token?: string };
};

export const xRelationshipCapabilities = {
  "message.receive": true,
  "message.send": true,
  "media.image": true,
  "media.video": true,
  "receipt.read": true,
  "outbound.proactive": true,
  "reconcile.history": true,
} as const;

function apiBase() {
  return (process.env.X_API_BASE_URL || "https://api.x.com").replace(/\/$/, "");
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeXEvents(payload: XPayload, accountId: string): NormalizedRelationshipEvent[] {
  const users = new Map((payload.includes?.users ?? []).flatMap((user) => user.id ? [[user.id, user] as const] : []));
  const media = new Map((payload.includes?.media ?? []).flatMap((item) => item.media_key ? [[item.media_key, item] as const] : []));
  return (payload.direct_message_events ?? payload.data ?? []).flatMap((event) => {
    if (event.event_type !== "MessageCreate" || !event.id || !event.sender_id || event.sender_id === accountId) return [];
    const actor = users.get(event.sender_id);
    const threadId = event.dm_conversation_id || event.participant_ids?.filter((id) => id !== accountId).sort().join(":") || event.sender_id;
    const attachments: NonNullable<NormalizedRelationshipEvent["message"]>["attachments"] = (event.attachments?.media_keys ?? []).flatMap((key) => {
      const item = media.get(key);
      const type = item?.type === "photo" ? "image" : item?.type === "video" || item?.type === "animated_gif" ? "video" : null;
      const sourceUrl = item?.url || item?.preview_image_url;
      return type ? [{ externalMediaId: key, type: type as "image" | "video", ...(sourceUrl ? { sourceUrl } : {}), metadata: {} }] : [];
    });
    return [{
      version: "relationship.event.v1" as const,
      provider: "x",
      externalEventId: `dm:${event.id}`,
      eventType: "social.dm.received" as const,
      occurredAt: event.created_at ? new Date(event.created_at) : new Date(),
      actor: {
        providerSubjectId: event.sender_id,
        username: stringValue(actor?.username),
        displayName: stringValue(actor?.name),
        avatarUrl: stringValue(actor?.profile_image_url),
        verified: actor?.verified === true,
        metadata: {},
      },
      thread: { externalThreadId: threadId, kind: (event.participant_ids?.length ?? 0) > 2 ? "group" as const : "direct" as const, metadata: { participantIds: event.participant_ids ?? [] } },
      message: { externalMessageId: event.id, type: attachments[0]?.type ?? "text" as const, body: event.text ?? "", bodyFormat: "plain" as const, attachments, metadata: {} },
      metadata: { automated: false },
    }];
  });
}

function xError(response: Response, body: unknown) {
  const payload = body as { title?: string; detail?: string; errors?: Array<{ message?: string; code?: number }> };
  const retryAfter = response.headers.get("x-rate-limit-reset");
  const retryAfterMs = retryAfter ? Math.max(0, Number(retryAfter) * 1_000 - Date.now()) : undefined;
  return Object.assign(new Error(payload.detail || payload.title || payload.errors?.[0]?.message || `X request failed (${response.status})`), {
    errorClass: (response.status === 429 ? "rate_limited" : response.status === 401 ? "authentication" : response.status === 403 ? "permission" : response.status >= 500 ? "retryable" : "permanent") as RelationshipAdapterError["errorClass"],
    code: payload.errors?.[0]?.code ? `x_${payload.errors[0].code}` : `http_${response.status}`,
    retryAfterMs,
  });
}

async function xJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw xError(response, body);
  return body as T;
}

export const xRelationshipAdapter: RelationshipChannelAdapter = {
  provider: "x",
  capabilities: xRelationshipCapabilities,
  verifyWebhook({ rawBody, headers, context }) {
    const secret = context.webhookSecret || process.env.X_API_SECRET;
    if (!secret) return false;
    const value = headers["x-twitter-webhooks-signature"];
    const signature = Array.isArray(value) ? value[0] : value;
    if (!signature?.startsWith("sha256=")) return false;
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("base64")}`;
    return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  },
  async normalizeWebhook({ body, context }) {
    return normalizeXEvents(body as XPayload, context.providerAccountId);
  },
  async deliver({ action, context }) {
    if (!context.accessToken) throw Object.assign(new Error("X connection needs reauthorization"), { errorClass: "authentication" as const, code: "missing_access_token" });
    if (action.attachments.some((attachment) => !attachment.externalMediaId)) {
      throw Object.assign(new Error("X attachments must be uploaded before delivery"), { errorClass: "invalid_content" as const, code: "x_media_upload_required" });
    }
    const response = await fetch(`${apiBase()}/2/dm_conversations/${encodeURIComponent(action.externalThreadId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${context.accessToken}`, "content-type": "application/json", "idempotency-key": action.idempotencyKey },
      body: JSON.stringify({ text: action.body, ...(action.attachments.length ? { attachments: action.attachments.map((attachment) => ({ media_id: attachment.externalMediaId })) } : {}) }),
    });
    const body = await xJson<{ data?: { dm_event_id?: string; dm_conversation_id?: string } }>(response);
    const messageId = body.data?.dm_event_id;
    if (!messageId) throw Object.assign(new Error("X response did not include a DM event ID"), { errorClass: "retryable" as const, code: "missing_message_id" });
    return { status: "sent", externalMessageId: messageId, providerRequestId: messageId, occurredAt: new Date(), metadata: { conversationId: body.data?.dm_conversation_id ?? action.externalThreadId } };
  },
  async reconcile({ cursor, context, limit }) {
    if (!context.accessToken) throw Object.assign(new Error("X connection needs reauthorization"), { errorClass: "authentication" as const, code: "missing_access_token" });
    const url = new URL(`${apiBase()}/2/dm_events`);
    url.searchParams.set("max_results", String(Math.max(10, Math.min(limit, 100))));
    url.searchParams.set("dm_event.fields", "id,event_type,text,dm_conversation_id,created_at,sender_id,participant_ids,attachments");
    url.searchParams.set("expansions", "sender_id,attachments.media_keys");
    url.searchParams.set("user.fields", "id,name,username,profile_image_url,verified");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url");
    if (cursor) url.searchParams.set("pagination_token", cursor);
    const payload = await xJson<XPayload>(await fetch(url, { headers: { authorization: `Bearer ${context.accessToken}` } }));
    return { events: normalizeXEvents(payload, context.providerAccountId), nextCursor: payload.meta?.next_token, hasMore: Boolean(payload.meta?.next_token) };
  },
  async health({ context }) {
    if (!context.accessToken) return { healthy: false, message: "X access token is missing" };
    try {
      const response = await fetch(`${apiBase()}/2/users/me`, { headers: { authorization: `Bearer ${context.accessToken}` } });
      return response.ok ? { healthy: true, capabilities: xRelationshipCapabilities } : { healthy: false, message: `X validation failed (${response.status})` };
    } catch {
      return { healthy: false, message: "X validation could not be completed" };
    }
  },
  classifyError(error) {
    const typed = error as RelationshipAdapterError;
    return { errorClass: typed.errorClass ?? "retryable", code: typed.code, retryAfterMs: typed.retryAfterMs };
  },
};

export function createXWebhookCrcResponse(crcToken: string, consumerSecret: string) {
  return `sha256=${crypto.createHmac("sha256", consumerSecret).update(crcToken).digest("base64")}`;
}
