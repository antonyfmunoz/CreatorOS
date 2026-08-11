import type {
  NormalizedRelationshipEvent,
  RelationshipCapability,
  RelationshipOutboundAction,
  RelationshipProviderErrorClass,
} from "./relationship-hub-policy";
import {
  assertRelationshipCapability,
  normalizedRelationshipEventSchema,
  relationshipOutboundActionSchema,
} from "./relationship-hub-policy";

export type RelationshipAdapterContext = {
  businessId: string;
  connectionId: string;
  providerAccountId: string;
  accessToken?: string;
  webhookSecret?: string;
  metadata: Record<string, unknown>;
};

export type RelationshipDeliveryResult = {
  status: "accepted" | "sent" | "delivered";
  providerRequestId?: string;
  externalMessageId: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
};

export type RelationshipReconciliationResult = {
  events: NormalizedRelationshipEvent[];
  nextCursor?: string;
  hasMore: boolean;
};

export type RelationshipAdapterError = Error & {
  errorClass?: RelationshipProviderErrorClass;
  code?: string;
  retryAfterMs?: number;
};

export interface RelationshipChannelAdapter {
  readonly provider: string;
  readonly capabilities: Partial<Record<RelationshipCapability, boolean>>;
  verifyWebhook?(input: { rawBody: Buffer; headers: Record<string, string | string[] | undefined>; context: RelationshipAdapterContext }): Promise<boolean> | boolean;
  normalizeWebhook(input: { body: unknown; headers: Record<string, string | string[] | undefined>; context: RelationshipAdapterContext }): Promise<NormalizedRelationshipEvent[]>;
  deliver(input: { action: RelationshipOutboundAction; context: RelationshipAdapterContext }): Promise<RelationshipDeliveryResult>;
  reconcile?(input: { cursor?: string; context: RelationshipAdapterContext; limit: number }): Promise<RelationshipReconciliationResult>;
  health(input: { context: RelationshipAdapterContext }): Promise<{ healthy: boolean; message?: string; capabilities?: Partial<Record<RelationshipCapability, boolean>> }>;
  classifyError(error: unknown): { errorClass: RelationshipProviderErrorClass; code?: string; retryAfterMs?: number };
}

const adapters = new Map<string, RelationshipChannelAdapter>();

function providerKey(provider: string) {
  return provider.trim().toLowerCase();
}

export function registerRelationshipAdapter(adapter: RelationshipChannelAdapter, options: { replace?: boolean } = {}) {
  const key = providerKey(adapter.provider);
  if (!key) throw new Error("Relationship adapter provider is required");
  if (adapters.has(key) && !options.replace) throw new Error(`Relationship adapter already registered: ${key}`);
  adapters.set(key, adapter);
  return adapter;
}

export function getRelationshipAdapter(provider: string) {
  return adapters.get(providerKey(provider));
}

export function requireRelationshipAdapter(provider: string) {
  const adapter = getRelationshipAdapter(provider);
  if (!adapter) throw new Error(`Relationship provider is not activated: ${provider}`);
  return adapter;
}

export function listRelationshipAdapters() {
  return Array.from(adapters.values()).map((adapter) => ({
    provider: adapter.provider,
    capabilities: { ...adapter.capabilities },
  }));
}

export function clearRelationshipAdaptersForTests() {
  adapters.clear();
}

export async function normalizeRelationshipWebhook(
  adapter: RelationshipChannelAdapter,
  input: Parameters<RelationshipChannelAdapter["normalizeWebhook"]>[0],
) {
  const events = await adapter.normalizeWebhook(input);
  return events.map((event) => normalizedRelationshipEventSchema.parse(event));
}

export async function deliverRelationshipAction(
  adapter: RelationshipChannelAdapter,
  input: Parameters<RelationshipChannelAdapter["deliver"]>[0],
) {
  const action = relationshipOutboundActionSchema.parse(input.action);
  assertRelationshipCapability(adapter.capabilities, action.actionType);
  for (const attachment of action.attachments) {
    const capability = `media.${attachment.type}` as RelationshipCapability;
    if (adapter.capabilities[capability] !== true) {
      throw new Error(`This connection does not support ${capability}`);
    }
  }
  return adapter.deliver({ ...input, action });
}

export function createInMemoryRelationshipAdapter(input: {
  provider?: string;
  capabilities?: Partial<Record<RelationshipCapability, boolean>>;
  incoming?: NormalizedRelationshipEvent[];
}) {
  const deliveries: RelationshipOutboundAction[] = [];
  const incoming = [...(input.incoming ?? [])];
  const adapter: RelationshipChannelAdapter & { deliveries: RelationshipOutboundAction[] } = {
    provider: input.provider ?? "test",
    capabilities: input.capabilities ?? {
      "message.receive": true,
      "message.send": true,
      "media.audio": true,
      "media.voice_note": true,
      "receipt.delivered": true,
      "reconcile.history": true,
    },
    deliveries,
    async normalizeWebhook({ body }) {
      return Array.isArray(body) ? body.map((event) => normalizedRelationshipEventSchema.parse(event)) : [normalizedRelationshipEventSchema.parse(body)];
    },
    async deliver({ action }) {
      deliveries.push(action);
      return {
        status: "accepted",
        providerRequestId: `request-${deliveries.length}`,
        externalMessageId: `message-${deliveries.length}`,
        occurredAt: new Date(),
      };
    },
    async reconcile({ cursor, limit }) {
      const start = cursor ? Number(cursor) : 0;
      const events = incoming.slice(start, start + limit);
      const next = start + events.length;
      return { events, nextCursor: String(next), hasMore: next < incoming.length };
    },
    async health() {
      return { healthy: true, capabilities: this.capabilities };
    },
    classifyError(error) {
      const typed = error as RelationshipAdapterError;
      return {
        errorClass: typed.errorClass ?? "retryable",
        code: typed.code,
        retryAfterMs: typed.retryAfterMs,
      };
    },
  };
  return adapter;
}
