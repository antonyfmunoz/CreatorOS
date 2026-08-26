import crypto from "node:crypto";
import type { RelationshipChannelAdapter, RelationshipAdapterError } from "./relationship-channel-adapters";
import type { NormalizedRelationshipEvent } from "./relationship-hub-policy";

type InstagramWebhook = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<Record<string, unknown>>;
    changes?: Array<{ field?: string; value?: Record<string, unknown> }>;
  }>;
};

const instagramCapabilities = {
  "message.receive": true,
  "message.send": true,
  "comment.receive": true,
  "comment.reply": true,
  "comment.private_reply": true,
  "media.image": true,
  "media.video": true,
  "media.audio": true,
  "media.voice_note": true,
  "receipt.read": true,
  "outbound.proactive": false,
  "outbound.template_required": false,
} as const;

function requiredGraphVersion() {
  const version = process.env.META_GRAPH_API_VERSION?.trim();
  if (!version || !/^v\d+\.\d+$/.test(version)) throw new Error("META_GRAPH_API_VERSION is not configured");
  return version;
}

function graphUrl(accountId: string, path: string) {
  const base = (process.env.META_INSTAGRAM_GRAPH_BASE_URL || "https://graph.instagram.com").replace(/\/$/, "");
  return `${base}/${requiredGraphVersion()}/${encodeURIComponent(accountId)}${path}`;
}

function timestamp(value: unknown, fallback?: number) {
  const numeric = typeof value === "number" ? value : fallback;
  if (!numeric) return new Date();
  return new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric);
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeMessaging(entryId: string, entryTime: number | undefined, item: Record<string, unknown>): NormalizedRelationshipEvent[] {
  const sender = item.sender as { id?: unknown } | undefined;
  const recipient = item.recipient as { id?: unknown } | undefined;
  const senderId = stringField(sender?.id);
  const recipientId = stringField(recipient?.id);
  const message = item.message as { mid?: unknown; text?: unknown; is_echo?: unknown; attachments?: Array<{ type?: unknown; payload?: { url?: unknown } }> } | undefined;
  const postback = item.postback as { mid?: unknown; title?: unknown; payload?: unknown } | undefined;
  const read = item.read as { mid?: unknown; watermark?: unknown } | undefined;
  if (message && message.is_echo !== true && senderId && recipientId) {
    const messageId = stringField(message.mid) ?? `${senderId}:${String(item.timestamp ?? entryTime ?? Date.now())}`;
    const attachments = (message.attachments ?? []).flatMap((attachment) => {
      const sourceUrl = stringField(attachment.payload?.url);
      const type = attachment.type === "image" || attachment.type === "video" || attachment.type === "audio" || attachment.type === "file" ? attachment.type as "image" | "video" | "audio" | "file" : null;
      return sourceUrl && type ? [{ type, sourceUrl, metadata: {} }] : [];
    });
    return [{
      version: "relationship.event.v1",
      provider: "instagram",
      externalEventId: `message:${messageId}`,
      eventType: "social.dm.received",
      occurredAt: timestamp(item.timestamp, entryTime),
      actor: { providerSubjectId: senderId, verified: false, metadata: {} },
      thread: { externalThreadId: senderId, kind: "direct", metadata: { instagramAccountId: entryId } },
      message: { externalMessageId: messageId, type: attachments[0]?.type ?? "text", body: stringField(message.text) ?? "", bodyFormat: "plain", attachments, metadata: {} },
      metadata: { automated: false },
    }];
  }
  if (postback && senderId) {
    const postbackId = stringField(postback.mid) ?? `${senderId}:${String(item.timestamp ?? entryTime ?? Date.now())}:${stringField(postback.payload) ?? "postback"}`;
    return [{
      version: "relationship.event.v1",
      provider: "instagram",
      externalEventId: `postback:${postbackId}`,
      eventType: "social.dm.received",
      occurredAt: timestamp(item.timestamp, entryTime),
      actor: { providerSubjectId: senderId, verified: false, metadata: {} },
      thread: { externalThreadId: senderId, kind: "direct", metadata: { instagramAccountId: entryId } },
      message: { externalMessageId: postbackId, type: "text", body: stringField(postback.title) ?? stringField(postback.payload) ?? "", bodyFormat: "plain", attachments: [], metadata: { postbackPayload: stringField(postback.payload) ?? null } },
      metadata: { automated: false, source: "postback" },
    }];
  }
  if (read && senderId) {
    const externalMessageId = stringField(read.mid) ?? String(read.watermark ?? "");
    if (!externalMessageId) return [];
    return [{
      version: "relationship.event.v1",
      provider: "instagram",
      externalEventId: `read:${senderId}:${externalMessageId}`,
      eventType: "message.read",
      occurredAt: timestamp(item.timestamp, entryTime),
      actor: { providerSubjectId: senderId, verified: false, metadata: {} },
      thread: { externalThreadId: senderId, kind: "direct", metadata: { instagramAccountId: entryId } },
      receipt: { externalMessageId, type: "read", metadata: {} },
      metadata: {},
    }];
  }
  return [];
}

function normalizeChange(entryId: string, entryTime: number | undefined, change: { field?: string; value?: Record<string, unknown> }): NormalizedRelationshipEvent[] {
  if (change.field !== "comments" || !change.value) return [];
  const value = change.value;
  const commentId = stringField(value.id);
  const from = value.from as { id?: unknown; username?: unknown } | undefined;
  const actorId = stringField(from?.id);
  if (!commentId || !actorId) return [];
  const media = value.media as { id?: unknown } | undefined;
  return [{
    version: "relationship.event.v1",
    provider: "instagram",
    externalEventId: `comment:${commentId}`,
    eventType: "social.comment.created",
    occurredAt: timestamp(value.created_time, entryTime),
    actor: { providerSubjectId: actorId, username: stringField(from?.username), verified: false, metadata: {} },
    thread: { externalThreadId: commentId, kind: "comment", metadata: { instagramAccountId: entryId, mediaId: stringField(media?.id) } },
    message: { externalMessageId: commentId, type: "text", body: stringField(value.text) ?? "", bodyFormat: "plain", attachments: [], metadata: { mediaId: stringField(media?.id) } },
    metadata: { automated: false },
  }];
}

function instagramError(response: Response, body: unknown) {
  const graph = body as { error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean } };
  const error = Object.assign(new Error(graph.error?.message || `Instagram request failed (${response.status})`), {
    errorClass: (response.status === 429 || graph.error?.is_transient ? "rate_limited" : response.status === 401 ? "authentication" : response.status === 403 ? "permission" : response.status >= 500 ? "retryable" : "permanent") as RelationshipAdapterError["errorClass"],
    code: graph.error?.code ? `meta_${graph.error.code}${graph.error.error_subcode ? `_${graph.error.error_subcode}` : ""}` : `http_${response.status}`,
    retryAfterMs: response.headers.get("retry-after") ? Number(response.headers.get("retry-after")) * 1_000 : undefined,
  });
  return error;
}

function instagramOutboundMessage(action: Parameters<RelationshipChannelAdapter["deliver"]>[0]["action"]) {
  const attachment = action.attachments[0];
  if (!attachment) return { text: action.body };
  if (action.attachments.length > 1) throw Object.assign(new Error("Instagram delivery supports one attachment at a time"), { errorClass: "invalid_content" as const, code: "instagram_attachment_invalid" });
  const type = attachment.type === "voice_note" ? "audio" : attachment.type;
  if (!(["image", "video", "audio"] as string[]).includes(type)) throw Object.assign(new Error("Instagram supports image, video, and audio message attachments"), { errorClass: "invalid_content" as const, code: "instagram_attachment_invalid" });
  const payload = attachment.externalMediaId ? { attachment_id: attachment.externalMediaId } : attachment.sourceUrl ? { url: attachment.sourceUrl } : null;
  if (!payload) throw Object.assign(new Error("Instagram attachment needs a hosted URL or uploaded attachment ID"), { errorClass: "invalid_content" as const, code: "instagram_attachment_invalid" });
  return { attachment: { type, payload } };
}

export const instagramRelationshipAdapter: RelationshipChannelAdapter = {
  provider: "instagram",
  capabilities: instagramCapabilities,
  verifyWebhook({ rawBody, headers }) {
    const secret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
    if (!secret) return false;
    const header = headers["x-hub-signature-256"];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature?.startsWith("sha256=")) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const actual = signature.slice(7);
    return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  },
  async normalizeWebhook({ body, context }) {
    const webhook = body as InstagramWebhook;
    if (webhook.object !== "instagram" || !Array.isArray(webhook.entry)) return [];
    const events: NormalizedRelationshipEvent[] = [];
    for (const entry of webhook.entry) {
      if (!entry.id || entry.id !== context.providerAccountId) continue;
      for (const item of entry.messaging ?? []) events.push(...normalizeMessaging(entry.id, entry.time, item));
      for (const change of entry.changes ?? []) events.push(...normalizeChange(entry.id, entry.time, change));
    }
    return events;
  },
  async deliver({ action, context }) {
    if (!context.accessToken) throw Object.assign(new Error("Instagram connection needs reauthorization"), { errorClass: "authentication" as const, code: "missing_access_token" });
    let url: string;
    let payload: Record<string, unknown>;
    if (action.actionType === "comment.reply") {
      const commentId = action.replyToExternalMessageId || action.externalThreadId;
      url = graphUrl(commentId, "/replies");
      payload = { message: action.body };
    } else {
      url = graphUrl(context.providerAccountId, "/messages");
      payload = action.actionType === "comment.private_reply"
        ? { recipient: { comment_id: action.replyToExternalMessageId || action.externalThreadId }, message: { text: action.body } }
        : { recipient: { id: action.externalThreadId }, messaging_type: "RESPONSE", message: instagramOutboundMessage(action) };
    }
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${context.accessToken}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({})) as { message_id?: string; recipient_id?: string; id?: string };
    if (!response.ok) throw instagramError(response, body);
    const externalMessageId = body.message_id || body.id;
    if (!externalMessageId) throw Object.assign(new Error("Instagram response did not include a message ID"), { errorClass: "retryable" as const, code: "missing_message_id" });
    return { status: "accepted", externalMessageId, providerRequestId: externalMessageId, occurredAt: new Date(), metadata: { recipientId: body.recipient_id ?? null } };
  },
  async health({ context }) {
    if (!context.accessToken) return { healthy: false, message: "Instagram access token is missing" };
    try {
      const response = await fetch(graphUrl(context.providerAccountId, "?fields=user_id,username"), { headers: { authorization: `Bearer ${context.accessToken}` } });
      if (!response.ok) return { healthy: false, message: `Instagram validation failed (${response.status})` };
      return { healthy: true, capabilities: instagramCapabilities };
    } catch {
      return { healthy: false, message: "Instagram validation could not be completed" };
    }
  },
  classifyError(error) {
    const typed = error as RelationshipAdapterError;
    return { errorClass: typed.errorClass ?? "retryable", code: typed.code, retryAfterMs: typed.retryAfterMs };
  },
};
