import crypto from "node:crypto";
import type { RelationshipAdapterError, RelationshipChannelAdapter } from "./relationship-channel-adapters";
import type { NormalizedRelationshipEvent, RelationshipOutboundAction } from "./relationship-hub-policy";

function graphVersion() {
  const value = process.env.META_GRAPH_API_VERSION;
  if (!value || !/^v\d+\.\d+$/.test(value)) throw new Error("META_GRAPH_API_VERSION is not configured");
  return value;
}

function graphBase() {
  return (process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");
}

function graphUrl(accountId: string, path: string) {
  return `${graphBase()}/${graphVersion()}/${encodeURIComponent(accountId)}${path}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function occurredAt(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return new Date();
  return new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric);
}

function verifyMetaSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, secret?: string) {
  if (!secret) return false;
  const header = headers["x-hub-signature-256"];
  const signature = Array.isArray(header) ? header[0] : header;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signature.slice(7);
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function metaError(response: Response, body: unknown) {
  const payload = body as { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean } };
  const retryAfter = response.headers.get("retry-after");
  return Object.assign(new Error(payload.error?.message || `Meta request failed (${response.status})`), {
    errorClass: (response.status === 429 || payload.error?.is_transient ? "rate_limited" : response.status === 401 ? "authentication" : response.status === 403 ? "permission" : response.status >= 500 ? "retryable" : "permanent") as RelationshipAdapterError["errorClass"],
    code: payload.error?.code ? `meta_${payload.error.code}${payload.error.error_subcode ? `_${payload.error.error_subcode}` : ""}` : `http_${response.status}`,
    retryAfterMs: retryAfter ? Number(retryAfter) * 1_000 : undefined,
  });
}

async function metaJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw metaError(response, body);
  return body as T;
}

function classifyMetaError(error: unknown) {
  const typed = error as RelationshipAdapterError;
  return { errorClass: typed.errorClass ?? "retryable" as const, code: typed.code, retryAfterMs: typed.retryAfterMs };
}

export const messengerRelationshipCapabilities = {
  "message.receive": true,
  "message.send": true,
  "media.image": true,
  "media.video": true,
  "media.audio": true,
  "media.file": true,
  "receipt.delivered": true,
  "receipt.read": true,
  "outbound.proactive": false,
} as const;

function normalizeMessenger(body: unknown, accountId: string): NormalizedRelationshipEvent[] {
  const payload = body as { object?: string; entry?: Array<{ id?: string; time?: number; messaging?: Array<Record<string, unknown>> }> };
  if (payload.object !== "page") return [];
  const events: NormalizedRelationshipEvent[] = [];
  for (const entry of payload.entry ?? []) {
    if (entry.id !== accountId) continue;
    for (const item of entry.messaging ?? []) {
      const senderId = stringValue((item.sender as { id?: unknown } | undefined)?.id);
      const message = item.message as { mid?: unknown; text?: unknown; is_echo?: unknown; reply_to?: { mid?: unknown }; attachments?: Array<{ type?: unknown; payload?: { url?: unknown; sticker_id?: unknown } }> } | undefined;
      if (senderId && message && message.is_echo !== true) {
        const messageId = stringValue(message.mid) || `${senderId}:${String(item.timestamp ?? entry.time ?? Date.now())}`;
        const attachments = (message.attachments ?? []).flatMap((attachment) => {
          const type = ["image", "video", "audio", "file"].includes(String(attachment.type)) ? attachment.type as "image" | "video" | "audio" | "file" : null;
          const sourceUrl = stringValue(attachment.payload?.url);
          return type && sourceUrl ? [{ type, sourceUrl, metadata: {} }] : [];
        });
        events.push({
          version: "relationship.event.v1", provider: "messenger", externalEventId: `message:${messageId}`, eventType: "social.dm.received", occurredAt: occurredAt(item.timestamp ?? entry.time),
          actor: { providerSubjectId: senderId, verified: false, metadata: {} },
          thread: { externalThreadId: senderId, kind: "direct", metadata: { pageId: accountId } },
          message: { externalMessageId: messageId, type: attachments[0]?.type ?? "text", body: stringValue(message.text) ?? "", bodyFormat: "plain", replyToExternalMessageId: stringValue(message.reply_to?.mid), attachments, metadata: {} },
          metadata: { automated: false },
        });
      }
      const read = item.read as { watermark?: unknown } | undefined;
      if (senderId && read?.watermark) {
        const watermark = String(read.watermark);
        events.push({ version: "relationship.event.v1", provider: "messenger", externalEventId: `read:${senderId}:${watermark}`, eventType: "message.read", occurredAt: occurredAt(item.timestamp ?? entry.time), actor: { providerSubjectId: senderId, verified: false, metadata: {} }, thread: { externalThreadId: senderId, kind: "direct", metadata: { pageId: accountId } }, receipt: { externalMessageId: watermark, type: "read", metadata: { watermark } }, metadata: {} });
      }
    }
  }
  return events;
}

function messengerPayload(action: RelationshipOutboundAction) {
  const attachment = action.attachments[0];
  if (!attachment) return { text: action.body };
  if (action.attachments.length > 1 || !attachment.sourceUrl) throw Object.assign(new Error("Messenger delivery supports one hosted attachment"), { errorClass: "invalid_content" as const, code: "messenger_attachment_invalid" });
  const type = attachment.type === "voice_note" ? "audio" : attachment.type;
  return { attachment: { type, payload: { url: attachment.sourceUrl, is_reusable: false } } };
}

export const messengerRelationshipAdapter: RelationshipChannelAdapter = {
  provider: "messenger",
  capabilities: messengerRelationshipCapabilities,
  verifyWebhook({ rawBody, headers, context }) { return verifyMetaSignature(rawBody, headers, context.webhookSecret || process.env.META_APP_SECRET); },
  async normalizeWebhook({ body, context }) { return normalizeMessenger(body, context.providerAccountId); },
  async deliver({ action, context }) {
    if (!context.accessToken) throw Object.assign(new Error("Messenger connection needs reauthorization"), { errorClass: "authentication" as const, code: "missing_access_token" });
    const response = await fetch(graphUrl(context.providerAccountId, "/messages"), { method: "POST", headers: { authorization: `Bearer ${context.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: action.externalThreadId }, messaging_type: "RESPONSE", message: messengerPayload(action) }) });
    const body = await metaJson<{ message_id?: string; recipient_id?: string }>(response);
    if (!body.message_id) throw Object.assign(new Error("Messenger response did not include a message ID"), { errorClass: "retryable" as const, code: "missing_message_id" });
    return { status: "sent", externalMessageId: body.message_id, providerRequestId: body.message_id, occurredAt: new Date(), metadata: { recipientId: body.recipient_id ?? action.externalThreadId } };
  },
  async health({ context }) {
    if (!context.accessToken) return { healthy: false, message: "Messenger page token is missing" };
    try { const response = await fetch(graphUrl(context.providerAccountId, "?fields=id,name"), { headers: { authorization: `Bearer ${context.accessToken}` } }); return response.ok ? { healthy: true, capabilities: messengerRelationshipCapabilities } : { healthy: false, message: `Messenger validation failed (${response.status})` }; } catch { return { healthy: false, message: "Messenger validation could not be completed" }; }
  },
  classifyError: classifyMetaError,
};

export const whatsappRelationshipCapabilities = {
  "message.receive": true,
  "message.send": true,
  "media.image": true,
  "media.video": true,
  "media.audio": true,
  "media.voice_note": true,
  "media.file": true,
  "receipt.delivered": true,
  "receipt.read": true,
  "outbound.proactive": false,
  "outbound.template_required": true,
} as const;

function normalizeWhatsApp(body: unknown, phoneNumberId: string): NormalizedRelationshipEvent[] {
  const payload = body as { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> };
  if (payload.object !== "whatsapp_business_account") return [];
  const events: NormalizedRelationshipEvent[] = [];
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    if (change.field !== "messages" || !change.value) continue;
    const value = change.value;
    const metadata = value.metadata as { phone_number_id?: unknown } | undefined;
    if (stringValue(metadata?.phone_number_id) !== phoneNumberId) continue;
    const contacts = new Map(((value.contacts as Array<{ wa_id?: string; profile?: { name?: string } }> | undefined) ?? []).flatMap((contact) => contact.wa_id ? [[contact.wa_id, contact] as const] : []));
    for (const message of (value.messages as Array<Record<string, unknown>> | undefined) ?? []) {
      const id = stringValue(message.id); const from = stringValue(message.from); const type = stringValue(message.type);
      if (!id || !from || !type) continue;
      const content = message[type] as Record<string, unknown> | undefined;
      const mediaType = type === "document" ? "file" : ["image", "video", "audio"].includes(type) ? type as "image" | "video" | "audio" : null;
      const externalMediaId = stringValue(content?.id);
      const attachments: NonNullable<NormalizedRelationshipEvent["message"]>["attachments"] = mediaType && externalMediaId ? [{ externalMediaId, type: mediaType as "image" | "video" | "audio" | "file", filename: stringValue(content?.filename), mimeType: stringValue(content?.mime_type), metadata: {} }] : [];
      const contact = contacts.get(from);
      events.push({
        version: "relationship.event.v1", provider: "whatsapp", externalEventId: `message:${id}`, eventType: "message.received", occurredAt: occurredAt(message.timestamp),
        actor: { providerSubjectId: from, address: from, displayName: stringValue(contact?.profile?.name), verified: true, metadata: {} },
        thread: { externalThreadId: from, kind: "direct", metadata: { phoneNumberId } },
        message: { externalMessageId: id, type: attachments[0]?.type ?? "text", body: stringValue((message.text as { body?: unknown } | undefined)?.body) ?? stringValue((message.button as { text?: unknown } | undefined)?.text) ?? "", bodyFormat: "plain", attachments, metadata: { providerType: type } },
        metadata: { automated: false },
      });
    }
    for (const status of (value.statuses as Array<Record<string, unknown>> | undefined) ?? []) {
      const id = stringValue(status.id); const recipient = stringValue(status.recipient_id); const state = stringValue(status.status);
      const receipt = state === "read" ? "read" : state === "delivered" ? "delivered" : state === "sent" ? "sent" : state === "failed" ? "failed" : null;
      if (!id || !recipient || !receipt) continue;
      events.push({ version: "relationship.event.v1", provider: "whatsapp", externalEventId: `status:${id}:${receipt}`, eventType: receipt === "read" ? "message.read" : "message.delivered", occurredAt: occurredAt(status.timestamp), actor: { providerSubjectId: recipient, address: recipient, verified: true, metadata: {} }, thread: { externalThreadId: recipient, kind: "direct", metadata: { phoneNumberId } }, receipt: { externalMessageId: id, type: receipt, metadata: {} }, metadata: {} });
    }
  }
  return events;
}

function whatsappMessage(action: RelationshipOutboundAction) {
  const attachment = action.attachments[0];
  if (!attachment) return { type: "text", text: { body: action.body } };
  if (action.attachments.length > 1) throw Object.assign(new Error("WhatsApp delivery supports one attachment at a time"), { errorClass: "invalid_content" as const, code: "whatsapp_attachment_invalid" });
  const type = attachment.type === "file" ? "document" : attachment.type === "voice_note" ? "audio" : attachment.type;
  const media = attachment.externalMediaId ? { id: attachment.externalMediaId } : attachment.sourceUrl ? { link: attachment.sourceUrl } : null;
  if (!media) throw Object.assign(new Error("WhatsApp attachment needs a media ID or hosted URL"), { errorClass: "invalid_content" as const, code: "whatsapp_attachment_invalid" });
  return { type, [type]: { ...media, ...(action.body && type !== "audio" ? { caption: action.body } : {}), ...(type === "document" && attachment.filename ? { filename: attachment.filename } : {}) } };
}

export const whatsappRelationshipAdapter: RelationshipChannelAdapter = {
  provider: "whatsapp",
  capabilities: whatsappRelationshipCapabilities,
  verifyWebhook({ rawBody, headers, context }) { return verifyMetaSignature(rawBody, headers, context.webhookSecret || process.env.META_APP_SECRET); },
  async normalizeWebhook({ body, context }) { return normalizeWhatsApp(body, context.providerAccountId); },
  async deliver({ action, context }) {
    if (!context.accessToken) throw Object.assign(new Error("WhatsApp connection needs reauthorization"), { errorClass: "authentication" as const, code: "missing_access_token" });
    const response = await fetch(graphUrl(context.providerAccountId, "/messages"), { method: "POST", headers: { authorization: `Bearer ${context.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: action.externalThreadId, ...whatsappMessage(action) }) });
    const body = await metaJson<{ messages?: Array<{ id?: string }> }>(response);
    const messageId = body.messages?.[0]?.id;
    if (!messageId) throw Object.assign(new Error("WhatsApp response did not include a message ID"), { errorClass: "retryable" as const, code: "missing_message_id" });
    return { status: "accepted", externalMessageId: messageId, providerRequestId: messageId, occurredAt: new Date() };
  },
  async health({ context }) {
    if (!context.accessToken) return { healthy: false, message: "WhatsApp access token is missing" };
    try { const response = await fetch(graphUrl(context.providerAccountId, "?fields=id,display_phone_number,verified_name"), { headers: { authorization: `Bearer ${context.accessToken}` } }); return response.ok ? { healthy: true, capabilities: whatsappRelationshipCapabilities } : { healthy: false, message: `WhatsApp validation failed (${response.status})` }; } catch { return { healthy: false, message: "WhatsApp validation could not be completed" }; }
  },
  classifyError: classifyMetaError,
};

export function verifyMetaWebhookChallenge(input: { mode?: string; token?: string; challenge?: string }, expected?: string) {
  if (!expected || input.mode !== "subscribe" || !input.token || !input.challenge) return null;
  const actual = Buffer.from(input.token); const wanted = Buffer.from(expected);
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted) ? input.challenge : null;
}
