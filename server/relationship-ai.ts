import OpenAI from "openai";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "./db";
import {
  relationshipAgentAuthorityPolicies,
  relationshipAgentSuggestions,
  relationshipConversations,
  relationshipMemoryFacts,
  relationshipMessages,
  relationships,
} from "../shared/schema";
import {
  hasRelationshipPromptInjectionSignal,
  relationshipAiResultSchema,
  relationshipAiSystemPrompt,
  relationshipSuggestionAction,
  defaultRelationshipAgentActions,
  type RelationshipAiResult,
} from "./relationship-ai-policy";
import {
  finalizeRelationshipUsage,
  releaseRelationshipUsage,
  reserveRelationshipUsage,
} from "./relationship-operations";
import { automationConfigContainsSecret } from "./automation-policy";

let relationshipOpenAiClient: OpenAI | null = null;

export function relationshipAiProviderStatus() {
  return {
    provider: "openai",
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.RELATIONSHIP_AI_MODEL || "gpt-4o-mini",
    mode: "draft_only",
  };
}

function relationshipAiClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Relationship AI provider is not configured");
  relationshipOpenAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return relationshipOpenAiClient;
}

function compactConversationPayload(input: {
  relationship: typeof relationships.$inferSelect | null;
  messages: Array<typeof relationshipMessages.$inferSelect>;
  memories: Array<typeof relationshipMemoryFacts.$inferSelect>;
}) {
  let remaining = 40_000;
  const messages = input.messages.flatMap((message) => {
    if (remaining <= 0) return [];
    const body = message.body.trim().slice(0, Math.min(4_000, remaining));
    remaining -= body.length;
    return [{
      id: message.id,
      direction: message.direction,
      authorType: message.authorType,
      provider: message.provider,
      occurredAt: message.occurredAt.toISOString(),
      body,
      possiblePromptInjection: hasRelationshipPromptInjectionSignal(body),
    }];
  });
  return {
    relationship: input.relationship ? {
      displayName: input.relationship.displayName,
      lifecycleStage: input.relationship.lifecycleStage,
      locale: input.relationship.locale,
      timezone: input.relationship.timezone,
    } : null,
    reviewedMemories: input.memories.map((memory) => ({
      id: memory.id,
      factType: memory.factType,
      value: memory.value,
      epistemicStatus: memory.epistemicStatus,
      confidence: memory.confidence,
      sourceType: memory.sourceType,
    })),
    messages,
  };
}

async function requestRelationshipAiResult(input: {
  systemPrompt: string;
  payload: ReturnType<typeof compactConversationPayload>;
}): Promise<RelationshipAiResult> {
  const completion = await relationshipAiClient().chat.completions.create({
    model: process.env.RELATIONSHIP_AI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content: `Analyze this JSON data and return: relationshipSummary, up to five suggestions, and directly evidenced memoryCandidates.\n${JSON.stringify(input.payload)}`,
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Relationship AI returned an empty result");
  return relationshipAiResultSchema.parse(JSON.parse(content));
}

export async function generateRelationshipSuggestions(input: {
  businessId: string;
  conversationId: string;
  agentKey: string;
  requestedByUserId: number;
}) {
  const [conversation] = await db.select().from(relationshipConversations).where(and(
    eq(relationshipConversations.id, input.conversationId),
    eq(relationshipConversations.businessId, input.businessId),
  )).limit(1);
  if (!conversation) throw new Error("Relationship conversation not found");
  if (conversation.aiMode === "observe") throw new Error("Enable suggestion mode before asking the relationship copilot");

  const [relationshipRows, messageRows, policyRows, memoryRows] = await Promise.all([
    conversation.relationshipId
      ? db.select().from(relationships).where(eq(relationships.id, conversation.relationshipId)).limit(1)
      : Promise.resolve([]),
    db.select().from(relationshipMessages).where(eq(relationshipMessages.conversationId, conversation.id)).orderBy(desc(relationshipMessages.occurredAt)).limit(60),
    db.select().from(relationshipAgentAuthorityPolicies).where(and(
      eq(relationshipAgentAuthorityPolicies.businessId, input.businessId),
      eq(relationshipAgentAuthorityPolicies.agentKey, input.agentKey),
      eq(relationshipAgentAuthorityPolicies.status, "active"),
    )).limit(1),
    conversation.relationshipId
      ? db.select().from(relationshipMemoryFacts).where(and(
        eq(relationshipMemoryFacts.businessId, input.businessId),
        eq(relationshipMemoryFacts.relationshipId, conversation.relationshipId),
        eq(relationshipMemoryFacts.status, "accepted"),
        or(isNull(relationshipMemoryFacts.expiresAt), gt(relationshipMemoryFacts.expiresAt, new Date())),
      )).orderBy(desc(relationshipMemoryFacts.updatedAt)).limit(50)
      : Promise.resolve([]),
  ]);
  const relationship = relationshipRows[0] ?? null;
  const policy = policyRows[0] ?? null;
  if (policy?.mode === "observe") throw new Error("The relationship copilot policy is observe-only");
  if (policy && policy.allowedActions.length === 0) throw new Error("The relationship copilot policy has no allowed suggestion actions");
  const usageKey = `ai.run:${crypto.randomUUID()}`;
  await reserveRelationshipUsage({
    businessId: input.businessId,
    metric: "ai.run",
    quantity: 1,
    sourceType: "conversation",
    sourceId: conversation.id,
    idempotencyKey: usageKey,
  });
  const aiPayload = compactConversationPayload({ relationship, messages: messageRows.reverse(), memories: memoryRows });
  let result: RelationshipAiResult;
  try {
    result = await requestRelationshipAiResult({
      systemPrompt: relationshipAiSystemPrompt(policy?.instructions ?? ""),
      payload: aiPayload,
    });
  } catch (error) {
    await releaseRelationshipUsage({ businessId: input.businessId, idempotencyKey: usageKey }).catch(() => undefined);
    throw error;
  }
  await finalizeRelationshipUsage({
    businessId: input.businessId,
    idempotencyKey: usageKey,
    quantity: 1,
    costUnits: Math.max(1, Math.ceil(JSON.stringify(aiPayload).length / 4_000)),
    provider: "openai",
  });
  const validMessageIds = new Set(messageRows.map((message) => message.id));
  const allowedActions = policy?.allowedActions ?? defaultRelationshipAgentActions;
  const filteredSuggestions = result.suggestions.flatMap((suggestion) => {
    if (!allowedActions.includes(relationshipSuggestionAction(suggestion.type))) return [];
    if (automationConfigContainsSecret(suggestion.title) || automationConfigContainsSecret(suggestion.body)) return [];
    const evidenceMessageIds = suggestion.evidenceMessageIds.filter((id) => validMessageIds.has(id));
    return evidenceMessageIds.length ? [{ ...suggestion, evidenceMessageIds }] : [];
  });

  const created = await db.transaction(async (tx) => {
    await tx.update(relationshipAgentSuggestions).set({ status: "superseded", reviewedAt: new Date() }).where(and(
      eq(relationshipAgentSuggestions.businessId, input.businessId),
      eq(relationshipAgentSuggestions.conversationId, conversation.id),
      eq(relationshipAgentSuggestions.agentKey, input.agentKey),
      eq(relationshipAgentSuggestions.status, "proposed"),
    ));
    if (relationship && result.relationshipSummary) {
      await tx.update(relationships).set({ aiSummary: result.relationshipSummary, updatedAt: new Date() }).where(eq(relationships.id, relationship.id));
    }
    const suggestions = filteredSuggestions.length
      ? await tx.insert(relationshipAgentSuggestions).values(filteredSuggestions.map((suggestion) => ({
        businessId: input.businessId,
        conversationId: conversation.id,
        relationshipId: relationship?.id ?? null,
        agentKey: input.agentKey,
        suggestionType: suggestion.type,
        title: suggestion.title,
        body: suggestion.body,
        confidence: suggestion.confidence,
        evidence: suggestion.evidenceMessageIds.map((messageId) => ({ messageId })),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      }))).returning()
      : [];
    if (relationship) {
      const memories = result.memoryCandidates.flatMap((candidate) => {
        if (automationConfigContainsSecret(candidate.value)) return [];
        const evidenceMessageIds = candidate.evidenceMessageIds.filter((id) => validMessageIds.has(id));
        if (!evidenceMessageIds.length) return [];
        return [{
          businessId: input.businessId,
          relationshipId: relationship.id,
          factType: candidate.factType,
          value: { text: candidate.value, evidenceMessageIds },
          epistemicStatus: "inferred",
          confidence: candidate.confidence,
          sourceType: "relationship_ai",
          sourceId: `conversation:${conversation.id}`,
          status: "proposed",
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60_000),
        }];
      });
      if (memories.length) await tx.insert(relationshipMemoryFacts).values(memories);
    }
    return suggestions;
  });
  return { relationshipSummary: result.relationshipSummary, suggestions: created };
}
