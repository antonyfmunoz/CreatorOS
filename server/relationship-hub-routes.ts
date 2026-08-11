import crypto from "node:crypto";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { ZodError, z } from "zod";
import { attachUser } from "./auth";
import { db } from "./db";
import { ensureDefaultBusiness, userCanAdminBusiness, userCanManageBusiness } from "./businesses";
import {
  relationshipAgentAuthorityPolicies,
  relationshipAgentSuggestions,
  relationshipAuditEvents,
  relationshipChannelConnections,
  relationshipConsents,
  relationshipConversationBindings,
  relationshipConversationNotes,
  relationshipConversationParticipants,
  relationshipConversations,
  relationshipDeliveryJobs,
  relationshipExternalIdentities,
  relationshipMemoryFacts,
  relationshipMergeCandidates,
  relationshipMessageAttachments,
  relationshipMessageReceipts,
  relationshipMessages,
  relationshipNotes,
  relationshipOperationalAlerts,
  relationshipUsageLedger,
  relationshipUsageReservations,
  relationshipRoomBindings,
  relationshipTagAssignments,
  relationshipTags,
  relationshipTasks,
  relationshipTenantPolicies,
  relationshipVoiceConsents,
  relationshipVoiceGenerationJobs,
  relationshipVoiceProfiles,
  relationships,
  communityMemberships,
  communityRooms,
} from "../shared/schema";
import { listRelationshipAdapters } from "./relationship-channel-adapters";
import {
  ensureNativeRelationshipConnection,
  ingestRelationshipWebhook,
  processRelationshipDeliveryJob,
  queueRelationshipMessage,
} from "./relationship-hub";
import { initializeRelationshipProviderRegistry } from "./relationship-provider-registry";
import { syncAllLegacyNativeConversations } from "./relationship-native-sync";
import { generateRelationshipSuggestions, relationshipAiProviderStatus } from "./relationship-ai";
import { defaultRelationshipAgentActions, relationshipAgentDecision, relationshipSuggestionAction } from "./relationship-ai-policy";
import {
  createRelationshipVoiceJob,
  processRelationshipVoiceJob,
  relationshipVoiceProviderStatus,
  relationshipVoiceReadUrl,
  verifyRelationshipVoiceProfile,
} from "./relationship-voice";
import { redactRelationshipSensitiveText, voiceUseCases } from "./relationship-hub-policy";
import {
  assertRelationshipConnectionAvailable,
  relationshipOperationsSnapshot,
} from "./relationship-operations";
import {
  completeInstagramRelationshipAuthorization,
  createInstagramRelationshipAuthorization,
  instagramRelationshipConfiguration,
  verifyInstagramWebhookChallenge,
} from "./relationship-instagram-oauth";
import { createXWebhookCrcResponse } from "./relationship-x-adapter";
import {
  completeXRelationshipAuthorization,
  createXRelationshipAuthorization,
  xRelationshipConfiguration,
} from "./relationship-x-oauth";
import {
  completeMessengerRelationshipAuthorization,
  connectWhatsAppRelationshipAccount,
  createMessengerRelationshipAuthorization,
  messengerRelationshipConfiguration,
  metaWebhookChallenge,
  whatsappRelationshipConfiguration,
} from "./relationship-meta-connections";
import {
  recordRelationshipConsent,
  recordRelationshipConsentSchema,
  reviewRelationshipMemorySchema,
} from "./relationship-governance";
import { automationConfigContainsSecret } from "./automation-policy";

const businessIdSchema = z.string().uuid();

const createRelationshipSchema = z.object({
  businessId: businessIdSchema.optional(),
  displayName: z.string().trim().min(1).max(500),
  avatarUrl: z.string().url().max(4_000).nullable().optional(),
  relationshipType: z.enum(["person", "organization"]).default("person"),
  lifecycleStage: z.string().trim().min(1).max(100).default("new"),
  source: z.string().trim().min(1).max(100).default("manual"),
  locale: z.string().trim().max(50).nullable().optional(),
  timezone: z.string().trim().max(100).nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

const updateRelationshipSchema = z.object({
  displayName: z.string().trim().min(1).max(500).optional(),
  avatarUrl: z.string().url().max(4_000).nullable().optional(),
  lifecycleStage: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "blocked", "archived"]).optional(),
  ownerUserId: z.number().int().positive().nullable().optional(),
  locale: z.string().trim().max(50).nullable().optional(),
  timezone: z.string().trim().max(100).nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(50_000),
  visibility: z.enum(["private", "team"]).default("team"),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  body: z.string().trim().max(20_000).default(""),
  assignedToUserId: z.number().int().positive().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  dueAt: z.coerce.date().nullable().optional(),
});

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().trim().max(50).nullable().optional(),
}).strict();

const updateTaskSchema = z.object({
  status: z.enum(["open", "completed", "canceled"]),
}).strict();

const createMergeCandidateSchema = z.object({
  targetRelationshipId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1_000),
  confidence: z.number().min(0).max(1).default(1),
}).strict();

const reviewMergeCandidateSchema = z.object({ decision: z.enum(["merge", "reject"]) }).strict();

const conversationUpdateSchema = z.object({
  status: z.enum(["open", "pending", "snoozed", "closed", "spam"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  queue: z.string().trim().min(1).max(100).optional(),
  assignedToUserId: z.number().int().positive().nullable().optional(),
  aiMode: z.enum(["observe", "suggest", "approval", "delegated"]).optional(),
  snoozedUntil: z.coerce.date().nullable().optional(),
});

const sendMessageSchema = z.object({
  connectionId: z.string().uuid().optional(),
  actionType: z.enum(["message.send", "comment.reply"]).default("message.send"),
  body: z.string().max(100_000).default(""),
  bodyFormat: z.enum(["plain", "markdown", "html"]).default("plain"),
  replyToExternalMessageId: z.string().trim().max(1_000).optional(),
  idempotencyKey: z.string().trim().min(8).max(500).optional(),
  attachments: z.array(z.object({
    externalMediaId: z.string().trim().min(1).max(500).optional(),
    type: z.enum(["image", "video", "audio", "voice_note", "file"]),
    sourceUrl: z.string().url().max(4_000).optional(),
    filename: z.string().trim().max(500).optional(),
    mimeType: z.string().trim().max(200).optional(),
    sizeBytes: z.number().int().nonnegative().max(2_000_000_000).optional(),
    durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })).max(20).default([]),
}).refine((input) => input.body.trim() || input.attachments.length, {
  message: "A message needs text or an attachment",
});

const agentPolicySchema = z.object({
  businessId: businessIdSchema.optional(),
  agentKey: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  mode: z.enum(["observe", "suggest", "approval", "delegated"]).default("observe"),
  allowedActions: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  approvalRequiredActions: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  blockedActions: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  channelAllowlist: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  maxCostUnitsPerRun: z.number().int().positive().max(100_000).default(100),
  instructions: z.string().max(20_000).default(""),
}).strict().superRefine((value, context) => {
  if (automationConfigContainsSecret(value.instructions)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["instructions"], message: "Credentials cannot be stored in relationship agent instructions" });
});

const voiceProfileSchema = z.object({
  businessId: businessIdSchema.optional(),
  provider: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(200),
  cloneType: z.enum(["instant", "professional"]).default("professional"),
  allowedUseCases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  blockedUseCases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

const relationshipAiSuggestSchema = z.object({
  agentKey: z.string().trim().min(1).max(200).default("relationship-copilot"),
}).strict();

const relationshipSuggestionReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
}).strict();

const verifyVoiceProfileSchema = z.object({
  providerVoiceId: z.string().trim().min(1).max(500),
  ownerAttestation: z.literal(true),
  consentText: z.string().trim().min(30).max(10_000),
}).strict();

const createVoiceMessageSchema = z.object({
  profileId: z.string().uuid(),
  script: z.string().trim().min(1).max(2_500),
  useCase: z.enum(voiceUseCases),
  sourceType: z.enum(["human", "agent"]).default("human"),
}).strict();

const relationshipRoomBindingSchema = z.object({
  roomId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  purpose: z.string().trim().min(1).max(200).default("relationship_meeting"),
  contextPolicy: z.object({
    includeTimeline: z.boolean().default(true),
    includePrivateNotes: z.boolean().default(false),
  }).strict().default({ includeTimeline: true, includePrivateNotes: false }),
}).strict();

const relationshipTenantPolicySchema = z.object({
  planKey: z.string().trim().min(1).max(100).optional(),
  enforcementMode: z.enum(["enforce", "monitor"]).optional(),
  monthlyOutboundMessages: z.number().int().min(-1).max(100_000_000).optional(),
  monthlyAiRuns: z.number().int().min(-1).max(10_000_000).optional(),
  monthlyVoiceSeconds: z.number().int().min(-1).max(100_000_000).optional(),
  monthlyRealtimeMinutes: z.number().int().min(-1).max(10_000_000).optional(),
  maxActiveConnections: z.number().int().min(-1).max(100_000).optional(),
  providerPayloadRetentionDays: z.number().int().min(1).max(90).optional(),
  auditRetentionDays: z.number().int().min(30).max(2_555).optional(),
  realtimeArtifactRetentionDays: z.number().int().min(1).max(365).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one policy change");

function relationshipHubError(res: Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ message: "Invalid Relationship Hub request", issues: error.issues });
  const message = error instanceof Error ? error.message : "Relationship Hub request failed";
  const status = /not found/i.test(message) ? 404
    : /not authorized|permission|authority|signature/i.test(message) ? 403
      : /not active|not activated|not configured|does not support|idempotency|conflict|enable suggestion|allowance reached/i.test(message) ? 409
        : 500;
  if (status === 500) console.error("Relationship Hub route failed", { errorType: error instanceof Error ? error.name : typeof error });
  return res.status(status).json({ message: status === 500 ? "Relationship Hub request failed" : message });
}

async function managedBusiness(req: Request, requested?: unknown) {
  const fallback = await ensureDefaultBusiness(req.dbUser!);
  const businessId = requested == null || requested === "" ? fallback.id : businessIdSchema.parse(requested);
  if (!(await userCanManageBusiness(req.dbUser!.id, businessId))) throw new Error("Not authorized to manage this business inbox");
  return businessId;
}

async function administeredBusiness(req: Request, requested?: unknown) {
  const fallback = await ensureDefaultBusiness(req.dbUser!);
  const businessId = requested == null || requested === "" ? fallback.id : businessIdSchema.parse(requested);
  if (!(await userCanAdminBusiness(req.dbUser!.id, businessId))) throw new Error("Owner or administrator authority is required for this Relationship Hub control");
  return businessId;
}

async function ownedRelationship(userId: number, relationshipId: string) {
  const [relationship] = await db.select().from(relationships).where(eq(relationships.id, relationshipId)).limit(1);
  if (!relationship) throw new Error("Relationship not found");
  if (!(await userCanManageBusiness(userId, relationship.businessId))) throw new Error("Not authorized to manage this relationship");
  return relationship;
}

async function ownedConversation(userId: number, conversationId: string) {
  const [conversation] = await db.select().from(relationshipConversations).where(eq(relationshipConversations.id, conversationId)).limit(1);
  if (!conversation) throw new Error("Relationship conversation not found");
  if (!(await userCanManageBusiness(userId, conversation.businessId))) throw new Error("Not authorized to manage this conversation");
  return conversation;
}

async function userCanManageRoom(userId: number, roomId: string) {
  const [room] = await db.select().from(communityRooms).where(eq(communityRooms.id, roomId)).limit(1);
  if (!room) return null;
  if (room.hostUserId === userId) return room;
  const [membership] = await db.select().from(communityMemberships).where(and(
    eq(communityMemberships.communityId, room.communityId),
    eq(communityMemberships.userId, userId),
    eq(communityMemberships.status, "active"),
    inArray(communityMemberships.role, ["owner", "admin"]),
  )).limit(1);
  return membership ? room : null;
}

async function canAccessConversationAudio(userId: number, conversationId: string, businessId: string) {
  if (await userCanManageBusiness(userId, businessId)) return true;
  const [participant] = await db.select({ id: relationshipConversationParticipants.id }).from(relationshipConversationParticipants).where(and(
    eq(relationshipConversationParticipants.conversationId, conversationId),
    eq(relationshipConversationParticipants.userId, userId),
  )).limit(1);
  return Boolean(participant);
}

async function deliverGeneratedVoiceJob(input: { jobId: string; userId: number }) {
  const job = await processRelationshipVoiceJob(input.jobId);
  if (!job?.conversationId) throw new Error("Voice generation did not complete");
  const conversation = await ownedConversation(input.userId, job.conversationId);
  const [binding] = await db.select().from(relationshipConversationBindings).where(and(eq(relationshipConversationBindings.conversationId, conversation.id), eq(relationshipConversationBindings.status, "active"))).limit(1);
  if (!binding?.connectionId) throw new Error("Conversation has no active channel connection");
  const [profile] = await db.select().from(relationshipVoiceProfiles).where(eq(relationshipVoiceProfiles.id, job.voiceProfileId)).limit(1);
  if (!profile) throw new Error("Voice profile not found");
  const publicBase = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const audioUrl = `${publicBase}/api/relationship-hub/voice-jobs/${job.id}/audio`;
  const queued = await queueRelationshipMessage({
    businessId: conversation.businessId,
    conversationId: conversation.id,
    connectionId: binding.connectionId,
    authorUserId: input.userId,
    authorType: job.sourceType === "agent" ? "agent" : "human",
    syntheticMedia: true,
    disclosure: profile.disclosureText,
    action: {
      version: "relationship.action.v1",
      actionType: "message.send",
      idempotencyKey: `voice-job:${job.id}`,
      externalThreadId: binding.externalThreadId,
      body: "Voice message",
      bodyFormat: "plain",
      attachments: [{ type: "voice_note", sourceUrl: audioUrl, mimeType: job.mimeType ?? "audio/mpeg", durationMs: job.durationMs ?? undefined, sizeBytes: job.sizeBytes ?? undefined, metadata: { voiceJobId: job.id, syntheticMedia: true } }],
      metadata: { voiceJobId: job.id, disclosure: profile.disclosureText, humanApprovedByUserId: input.userId },
    },
  });
  if (!queued.duplicate) void processRelationshipDeliveryJob(queued.job.id).catch((error) => console.error("Voice-message delivery failed", { errorType: error instanceof Error ? error.name : typeof error }));
  return { job, delivery: queued };
}

function safeVoiceJob(job: typeof relationshipVoiceGenerationJobs.$inferSelect) {
  const { scriptCiphertext: _script, ...safe } = job;
  return safe;
}

async function auditRelationshipAction(input: { businessId: string; actorUserId: number; action: string; targetType: string; targetId: string; metadata?: Record<string, unknown> }) {
  await db.insert(relationshipAuditEvents).values({ ...input, metadata: input.metadata ?? {} });
}

export function registerRelationshipHubRoutes(app: Express) {
  initializeRelationshipProviderRegistry();

  app.get("/api/relationship-hub/webhooks/instagram", (req, res) => {
    const challenge = verifyInstagramWebhookChallenge({ mode: typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined, token: typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : undefined, challenge: typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : undefined });
    if (!challenge) return res.status(403).send("Webhook verification failed");
    res.status(200).send(challenge);
  });

  app.post("/api/relationship-hub/webhooks/instagram", async (req, res) => {
    try {
      const body = req.body as { entry?: Array<{ id?: string }> };
      const accountIds = Array.from(new Set((body.entry ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id))));
      if (!accountIds.length) return res.status(202).json({ accepted: 0 });
      const connections = await db.select({ id: relationshipChannelConnections.id }).from(relationshipChannelConnections).where(and(eq(relationshipChannelConnections.provider, "instagram"), inArray(relationshipChannelConnections.providerAccountId, accountIds), inArray(relationshipChannelConnections.status, ["active", "testing"])));
      let accepted = 0;
      for (const connection of connections) {
        const results = await ingestRelationshipWebhook({ connectionId: connection.id, rawBody: req.rawBody ?? Buffer.alloc(0), body: req.body, headers: req.headers });
        accepted += results.length;
      }
      res.status(202).json({ accepted });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get(["/api/relationship-hub/webhooks/messenger", "/api/relationship-hub/webhooks/whatsapp"], (req, res) => {
    const challenge = metaWebhookChallenge({ mode: typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined, token: typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : undefined, challenge: typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : undefined });
    if (!challenge) return res.status(403).send("Webhook verification failed");
    res.status(200).send(challenge);
  });

  app.post("/api/relationship-hub/webhooks/messenger", async (req, res) => {
    try {
      const body = req.body as { entry?: Array<{ id?: string }> };
      const accountIds = Array.from(new Set((body.entry ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id))));
      if (!accountIds.length) return res.status(202).json({ accepted: 0 });
      const connections = await db.select({ id: relationshipChannelConnections.id }).from(relationshipChannelConnections).where(and(eq(relationshipChannelConnections.provider, "messenger"), inArray(relationshipChannelConnections.providerAccountId, accountIds), inArray(relationshipChannelConnections.status, ["active", "testing"])));
      let accepted = 0;
      for (const connection of connections) accepted += (await ingestRelationshipWebhook({ connectionId: connection.id, rawBody: req.rawBody ?? Buffer.alloc(0), body: req.body, headers: req.headers })).length;
      res.status(202).json({ accepted });
    } catch (error) { return relationshipHubError(res, error); }
  });

  app.post("/api/relationship-hub/webhooks/whatsapp", async (req, res) => {
    try {
      const body = req.body as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> };
      const accountIds = Array.from(new Set((body.entry ?? []).flatMap((entry) => entry.changes ?? []).map((change) => change.value?.metadata?.phone_number_id).filter((id): id is string => Boolean(id))));
      if (!accountIds.length) return res.status(202).json({ accepted: 0 });
      const connections = await db.select({ id: relationshipChannelConnections.id }).from(relationshipChannelConnections).where(and(eq(relationshipChannelConnections.provider, "whatsapp"), inArray(relationshipChannelConnections.providerAccountId, accountIds), inArray(relationshipChannelConnections.status, ["active", "testing"])));
      let accepted = 0;
      for (const connection of connections) accepted += (await ingestRelationshipWebhook({ connectionId: connection.id, rawBody: req.rawBody ?? Buffer.alloc(0), body: req.body, headers: req.headers })).length;
      res.status(202).json({ accepted });
    } catch (error) { return relationshipHubError(res, error); }
  });

  app.get("/api/relationship-hub/webhooks/x/:connectionId", async (req, res) => {
    try {
      const connectionId = z.string().uuid().parse(req.params.connectionId);
      const crcToken = z.string().min(1).parse(req.query.crc_token);
      const [connection] = await db.select({ id: relationshipChannelConnections.id }).from(relationshipChannelConnections).where(and(
        eq(relationshipChannelConnections.id, connectionId),
        eq(relationshipChannelConnections.provider, "x"),
        inArray(relationshipChannelConnections.status, ["active", "testing"]),
      )).limit(1);
      if (!connection || !process.env.X_API_SECRET) return res.status(404).json({ message: "X webhook is not configured" });
      res.json({ response_token: createXWebhookCrcResponse(crcToken, process.env.X_API_SECRET) });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/webhooks/x/:connectionId", async (req, res) => {
    try {
      const results = await ingestRelationshipWebhook({ connectionId: z.string().uuid().parse(req.params.connectionId), rawBody: req.rawBody ?? Buffer.alloc(0), body: req.body, headers: req.headers });
      res.status(202).json({ accepted: results.length });
    } catch (error) { return relationshipHubError(res, error); }
  });

  app.post("/api/relationship-hub/webhooks/:connectionId", async (req, res) => {
    try {
      const results = await ingestRelationshipWebhook({
        connectionId: z.string().uuid().parse(req.params.connectionId),
        rawBody: req.rawBody ?? Buffer.alloc(0),
        body: req.body,
        headers: req.headers,
      });
      res.status(202).json({ accepted: results.length });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/providers", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      const adapters = listRelationshipAdapters();
      const connections = await db.select({
        id: relationshipChannelConnections.id,
        provider: relationshipChannelConnections.provider,
        providerAccountName: relationshipChannelConnections.providerAccountName,
        status: relationshipChannelConnections.status,
        capabilities: relationshipChannelConnections.capabilities,
        lastValidatedAt: relationshipChannelConnections.lastValidatedAt,
        lastErrorCode: relationshipChannelConnections.lastErrorCode,
      }).from(relationshipChannelConnections).where(eq(relationshipChannelConnections.businessId, businessId));
      res.json({ adapters, connections, permissions: { canAdminister: await userCanAdminBusiness(req.dbUser!.id, businessId) }, configuration: { instagram: instagramRelationshipConfiguration(), messenger: messengerRelationshipConfiguration(), whatsapp: whatsappRelationshipConfiguration(), x: xRelationshipConfiguration() } });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/connections/instagram/authorize", attachUser, async (req, res) => {
    try {
      const businessId = await administeredBusiness(req, req.body?.businessId);
      if (!instagramRelationshipConfiguration().configured) throw new Error("Instagram relationship messaging is not configured");
      await assertRelationshipConnectionAvailable(businessId);
      const url = await createInstagramRelationshipAuthorization({ userId: req.dbUser!.id, businessId });
      res.json({ url });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/connections/instagram/callback", attachUser, async (req, res) => {
    try {
      const code = z.string().min(1).parse(req.query.code);
      const state = z.string().min(1).parse(req.query.state);
      await completeInstagramRelationshipAuthorization({ code, state, userId: req.dbUser!.id });
      res.redirect(302, "/messages?instagram=connected");
    } catch (error) {
      console.error("Instagram Relationship Hub authorization failed", { errorType: error instanceof Error ? error.name : typeof error });
      res.redirect(302, "/messages?instagram=error");
    }
  });

  app.post("/api/relationship-hub/connections/x/authorize", attachUser, async (req, res) => {
    try {
      const businessId = await administeredBusiness(req, req.body?.businessId);
      if (!xRelationshipConfiguration().configured) throw new Error("X relationship messaging is not configured");
      await assertRelationshipConnectionAvailable(businessId);
      res.json({ url: await createXRelationshipAuthorization({ userId: req.dbUser!.id, businessId }) });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/connections/x/callback", attachUser, async (req, res) => {
    try {
      const code = z.string().min(1).parse(req.query.code);
      const state = z.string().min(1).parse(req.query.state);
      await completeXRelationshipAuthorization({ code, state, userId: req.dbUser!.id });
      res.redirect(302, "/messages?x=connected");
    } catch (error) {
      console.error("X Relationship Hub authorization failed", { errorType: error instanceof Error ? error.name : typeof error });
      res.redirect(302, "/messages?x=error");
    }
  });

  app.post("/api/relationship-hub/connections/messenger/authorize", attachUser, async (req, res) => {
    try {
      const businessId = await administeredBusiness(req, req.body?.businessId);
      if (!messengerRelationshipConfiguration().configured) throw new Error("Messenger relationship messaging is not configured");
      await assertRelationshipConnectionAvailable(businessId);
      res.json({ url: await createMessengerRelationshipAuthorization({ userId: req.dbUser!.id, businessId }) });
    } catch (error) { return relationshipHubError(res, error); }
  });

  app.get("/api/relationship-hub/connections/messenger/callback", attachUser, async (req, res) => {
    try {
      const code = z.string().min(1).parse(req.query.code); const state = z.string().min(1).parse(req.query.state);
      await completeMessengerRelationshipAuthorization({ code, state, userId: req.dbUser!.id });
      res.redirect(302, "/messages?messenger=connected");
    } catch (error) {
      console.error("Messenger Relationship Hub authorization failed", { errorType: error instanceof Error ? error.name : typeof error });
      res.redirect(302, "/messages?messenger=error");
    }
  });

  app.post("/api/relationship-hub/connections/whatsapp", attachUser, async (req, res) => {
    try {
      const input = z.object({ businessId: businessIdSchema.optional(), phoneNumberId: z.string().trim().min(1).max(200), wabaId: z.string().trim().min(1).max(200).optional(), accessToken: z.string().trim().min(20).max(4_000), accountName: z.string().trim().min(1).max(200).optional() }).parse(req.body);
      const businessId = await administeredBusiness(req, input.businessId);
      if (!whatsappRelationshipConfiguration().configured) throw new Error("WhatsApp relationship messaging is not configured");
      await assertRelationshipConnectionAvailable(businessId);
      const connection = await connectWhatsAppRelationshipAccount({ ...input, businessId, userId: req.dbUser!.id });
      await auditRelationshipAction({ businessId, actorUserId: req.dbUser!.id, action: "connection.created", targetType: "channel_connection", targetId: connection.id, metadata: { provider: "whatsapp" } });
      res.status(201).json({ id: connection.id, provider: connection.provider, providerAccountName: connection.providerAccountName, status: connection.status });
    } catch (error) { return relationshipHubError(res, error); }
  });

  app.delete("/api/relationship-hub/connections/:connectionId", attachUser, async (req, res) => {
    try {
      const [connection] = await db.select().from(relationshipChannelConnections).where(eq(relationshipChannelConnections.id, req.params.connectionId)).limit(1);
      if (!connection || !(await userCanAdminBusiness(req.dbUser!.id, connection.businessId))) throw new Error("Relationship channel connection not found");
      await db.update(relationshipChannelConnections).set({ status: "disconnected", accessTokenCiphertext: null, refreshTokenCiphertext: null, webhookSecretCiphertext: null, updatedAt: new Date() }).where(eq(relationshipChannelConnections.id, connection.id));
      await auditRelationshipAction({ businessId: connection.businessId, actorUserId: req.dbUser!.id, action: "connection.disconnected", targetType: "channel_connection", targetId: connection.id, metadata: { provider: connection.provider } });
      res.status(204).end();
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/summary", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      const [relationshipCount, conversationCount, openCount, queuedCount, approvalCount] = await Promise.all([
        db.select({ count: count() }).from(relationships).where(and(eq(relationships.businessId, businessId), eq(relationships.status, "active"))),
        db.select({ count: count() }).from(relationshipConversations).where(eq(relationshipConversations.businessId, businessId)),
        db.select({ count: count() }).from(relationshipConversations).where(and(eq(relationshipConversations.businessId, businessId), inArray(relationshipConversations.status, ["open", "pending"]))),
        db.select({ count: count() }).from(relationshipDeliveryJobs).where(and(eq(relationshipDeliveryJobs.businessId, businessId), inArray(relationshipDeliveryJobs.status, ["queued", "retrying", "sending"]))),
        db.select({ count: count() }).from(relationshipAgentSuggestions).where(and(eq(relationshipAgentSuggestions.businessId, businessId), eq(relationshipAgentSuggestions.status, "proposed"))),
      ]);
      res.json({
        businessId,
        relationships: relationshipCount[0].count,
        conversations: conversationCount[0].count,
        openConversations: openCount[0].count,
        queuedDeliveries: queuedCount[0].count,
        pendingAiSuggestions: approvalCount[0].count,
      });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/operations", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      res.json(await relationshipOperationsSnapshot(businessId));
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.patch("/api/relationship-hub/operations/policy", attachUser, async (req, res) => {
    try {
      const businessId = await administeredBusiness(req, req.body?.businessId);
      const input = relationshipTenantPolicySchema.parse(req.body?.policy ?? req.body);
      const [policy] = await db.insert(relationshipTenantPolicies).values({ businessId, ...input, updatedByUserId: req.dbUser!.id }).onConflictDoUpdate({
        target: relationshipTenantPolicies.businessId,
        set: { ...input, updatedByUserId: req.dbUser!.id, updatedAt: new Date() },
      }).returning();
      await auditRelationshipAction({ businessId, actorUserId: req.dbUser!.id, action: "operations.policy_updated", targetType: "business", targetId: businessId, metadata: { fields: Object.keys(input) } });
      res.json(policy);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/operations/alerts/:alertId/acknowledge", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.body?.businessId);
      const [alert] = await db.update(relationshipOperationalAlerts).set({ status: "acknowledged", updatedAt: new Date() }).where(and(eq(relationshipOperationalAlerts.id, z.string().uuid().parse(req.params.alertId)), eq(relationshipOperationalAlerts.businessId, businessId), eq(relationshipOperationalAlerts.status, "open"))).returning();
      if (!alert) throw new Error("Relationship operation alert not found");
      res.json(alert);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/relationships/:relationshipId/rooms", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const bindings = await db.select({ binding: relationshipRoomBindings, room: communityRooms }).from(relationshipRoomBindings).innerJoin(communityRooms, eq(communityRooms.id, relationshipRoomBindings.roomId)).where(and(eq(relationshipRoomBindings.businessId, relationship.businessId), eq(relationshipRoomBindings.relationshipId, relationship.id))).orderBy(desc(relationshipRoomBindings.createdAt));
      res.json(bindings.map(({ binding, room }) => ({ ...binding, room })));
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/relationships/:relationshipId/eligible-rooms", attachUser, async (req, res) => {
    try {
      await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const memberships = await db.select({ communityId: communityMemberships.communityId }).from(communityMemberships).where(and(
        eq(communityMemberships.userId, req.dbUser!.id),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.role, ["owner", "admin"]),
      ));
      const managedCommunityIds = memberships.map((membership) => membership.communityId);
      const rooms = await db.select().from(communityRooms).where(or(
        eq(communityRooms.hostUserId, req.dbUser!.id),
        ...(managedCommunityIds.length ? [inArray(communityRooms.communityId, managedCommunityIds)] : []),
      )).orderBy(desc(communityRooms.startsAt)).limit(100);
      res.json(rooms);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/relationships/:relationshipId/rooms", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const input = relationshipRoomBindingSchema.parse(req.body);
      const room = await userCanManageRoom(req.dbUser!.id, input.roomId);
      if (!room) throw new Error("Not authorized to bind this community room");
      if (input.conversationId) {
        const conversation = await ownedConversation(req.dbUser!.id, input.conversationId);
        if (conversation.businessId !== relationship.businessId || conversation.relationshipId !== relationship.id) throw new Error("Room conversation does not belong to this relationship");
      }
      const [existingBinding] = await db.select().from(relationshipRoomBindings).where(eq(relationshipRoomBindings.roomId, room.id)).limit(1);
      if (existingBinding && (existingBinding.businessId !== relationship.businessId || existingBinding.relationshipId !== relationship.id)) {
        throw new Error("This room is already linked to another relationship");
      }
      const [binding] = await db.insert(relationshipRoomBindings).values({
        businessId: relationship.businessId,
        roomId: room.id,
        relationshipId: relationship.id,
        conversationId: input.conversationId ?? null,
        purpose: input.purpose,
        contextPolicy: input.contextPolicy,
        createdByUserId: req.dbUser!.id,
      }).onConflictDoUpdate({
        target: relationshipRoomBindings.roomId,
        set: { businessId: relationship.businessId, relationshipId: relationship.id, conversationId: input.conversationId ?? null, purpose: input.purpose, contextPolicy: input.contextPolicy, createdByUserId: req.dbUser!.id, updatedAt: new Date() },
      }).returning();
      await auditRelationshipAction({ businessId: relationship.businessId, actorUserId: req.dbUser!.id, action: "relationship_room.bound", targetType: "community_room", targetId: room.id, metadata: { relationshipId: relationship.id, conversationId: input.conversationId ?? null } });
      res.status(201).json({ ...binding, room });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/export", attachUser, async (req, res) => {
    try {
      const businessId = await administeredBusiness(req, req.query.businessId);
      const [relationshipRows, identityRows, consentRows, conversationRows, messageRows, attachmentRows, receiptRows, relationshipNoteRows, conversationNoteRows, taskRows, tagRows, tagAssignmentRows, memoryRows, suggestionRows, mergeRows, policyRows, usageRows, reservationRows, alertRows, roomBindingRows, auditRows, connectionRows] = await Promise.all([
        db.select().from(relationships).where(eq(relationships.businessId, businessId)),
        db.select().from(relationshipExternalIdentities).where(eq(relationshipExternalIdentities.businessId, businessId)),
        db.select().from(relationshipConsents).where(eq(relationshipConsents.businessId, businessId)),
        db.select().from(relationshipConversations).where(eq(relationshipConversations.businessId, businessId)),
        db.select().from(relationshipMessages).where(eq(relationshipMessages.businessId, businessId)).limit(100_000),
        db.select().from(relationshipMessageAttachments).where(eq(relationshipMessageAttachments.businessId, businessId)).limit(100_000),
        db.select().from(relationshipMessageReceipts).where(eq(relationshipMessageReceipts.businessId, businessId)).limit(100_000),
        db.select().from(relationshipNotes).where(eq(relationshipNotes.businessId, businessId)),
        db.select().from(relationshipConversationNotes).where(eq(relationshipConversationNotes.businessId, businessId)),
        db.select().from(relationshipTasks).where(eq(relationshipTasks.businessId, businessId)),
        db.select().from(relationshipTags).where(eq(relationshipTags.businessId, businessId)),
        db.select().from(relationshipTagAssignments).where(eq(relationshipTagAssignments.businessId, businessId)),
        db.select().from(relationshipMemoryFacts).where(eq(relationshipMemoryFacts.businessId, businessId)),
        db.select().from(relationshipAgentSuggestions).where(eq(relationshipAgentSuggestions.businessId, businessId)),
        db.select().from(relationshipMergeCandidates).where(eq(relationshipMergeCandidates.businessId, businessId)),
        db.select().from(relationshipAgentAuthorityPolicies).where(eq(relationshipAgentAuthorityPolicies.businessId, businessId)),
        db.select().from(relationshipUsageLedger).where(eq(relationshipUsageLedger.businessId, businessId)),
        db.select().from(relationshipUsageReservations).where(eq(relationshipUsageReservations.businessId, businessId)),
        db.select().from(relationshipOperationalAlerts).where(eq(relationshipOperationalAlerts.businessId, businessId)),
        db.select().from(relationshipRoomBindings).where(eq(relationshipRoomBindings.businessId, businessId)),
        db.select().from(relationshipAuditEvents).where(eq(relationshipAuditEvents.businessId, businessId)).limit(100_000),
        db.select({ id: relationshipChannelConnections.id, provider: relationshipChannelConnections.provider, providerAccountId: relationshipChannelConnections.providerAccountId, providerAccountName: relationshipChannelConnections.providerAccountName, status: relationshipChannelConnections.status, scopes: relationshipChannelConnections.scopes, capabilities: relationshipChannelConnections.capabilities, createdAt: relationshipChannelConnections.createdAt, updatedAt: relationshipChannelConnections.updatedAt }).from(relationshipChannelConnections).where(eq(relationshipChannelConnections.businessId, businessId)),
      ]);
      await auditRelationshipAction({ businessId, actorUserId: req.dbUser!.id, action: "relationship_data.exported", targetType: "business", targetId: businessId, metadata: { relationships: relationshipRows.length, conversations: conversationRows.length, messages: messageRows.length } });
      res.setHeader("Content-Disposition", `attachment; filename="creativesos-relationships-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json({ schemaVersion: "creativesos.relationship-export.v2", exportedAt: new Date().toISOString(), businessId, connections: connectionRows, relationships: relationshipRows, externalIdentities: identityRows, consents: consentRows, conversations: conversationRows, messages: messageRows, messageAttachments: attachmentRows, messageReceipts: receiptRows, relationshipNotes: relationshipNoteRows, conversationNotes: conversationNoteRows, tasks: taskRows, tags: tagRows, tagAssignments: tagAssignmentRows, memories: memoryRows, agentSuggestions: suggestionRows, mergeCandidates: mergeRows, agentPolicies: policyRows.map((policy) => ({ ...policy, instructions: redactRelationshipSensitiveText(policy.instructions) })), usageLedger: usageRows, usageReservations: reservationRows, operationalAlerts: alertRows, roomBindings: roomBindingRows, auditEvents: auditRows, limits: { messages: 100_000, messageAttachments: 100_000, messageReceipts: 100_000, auditEvents: 100_000 } });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/native/initialize", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.body?.businessId);
      const business = await ensureDefaultBusiness(req.dbUser!);
      const connection = await ensureNativeRelationshipConnection({ businessId, userId: req.dbUser!.id, businessName: business.name });
      const synchronized = await syncAllLegacyNativeConversations({ businessId, currentUserId: req.dbUser!.id });
      res.status(201).json({ connection, synchronizedConversations: synchronized.length });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/relationships", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : "";
      const status = typeof req.query.status === "string" ? req.query.status : "active";
      const conditions = [eq(relationships.businessId, businessId)];
      if (status !== "all") conditions.push(eq(relationships.status, status));
      if (search) conditions.push(or(ilike(relationships.displayName, `%${search}%`), ilike(relationships.aiSummary, `%${search}%`))!);
      const rows = await db.select().from(relationships).where(and(...conditions)).orderBy(desc(relationships.updatedAt)).limit(200);
      res.json(rows);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/relationships", attachUser, async (req, res) => {
    try {
      const input = createRelationshipSchema.parse(req.body);
      const businessId = await managedBusiness(req, input.businessId);
      const [relationship] = await db.insert(relationships).values({
        businessId,
        createdByUserId: req.dbUser!.id,
        ownerUserId: req.dbUser!.id,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        relationshipType: input.relationshipType,
        lifecycleStage: input.lifecycleStage,
        source: input.source,
        locale: input.locale ?? null,
        timezone: input.timezone ?? null,
        customFields: input.customFields,
      }).returning();
      await auditRelationshipAction({ businessId, actorUserId: req.dbUser!.id, action: "relationship.created", targetType: "relationship", targetId: relationship.id, metadata: { source: relationship.source } });
      res.status(201).json(relationship);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/relationships/:relationshipId", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const [identities, consents, notes, tasks, conversationsForRelationship, memories, tagRows] = await Promise.all([
        db.select().from(relationshipExternalIdentities).where(eq(relationshipExternalIdentities.relationshipId, relationship.id)).orderBy(desc(relationshipExternalIdentities.lastSeenAt)),
        db.select().from(relationshipConsents).where(eq(relationshipConsents.relationshipId, relationship.id)).orderBy(desc(relationshipConsents.updatedAt)),
        db.select().from(relationshipNotes).where(eq(relationshipNotes.relationshipId, relationship.id)).orderBy(desc(relationshipNotes.createdAt)).limit(100),
        db.select().from(relationshipTasks).where(eq(relationshipTasks.relationshipId, relationship.id)).orderBy(desc(relationshipTasks.createdAt)).limit(100),
        db.select().from(relationshipConversations).where(eq(relationshipConversations.relationshipId, relationship.id)).orderBy(desc(relationshipConversations.updatedAt)).limit(100),
        db.select().from(relationshipMemoryFacts).where(eq(relationshipMemoryFacts.relationshipId, relationship.id)).orderBy(desc(relationshipMemoryFacts.createdAt)).limit(100),
        db.select({ assignment: relationshipTagAssignments, tag: relationshipTags }).from(relationshipTagAssignments).innerJoin(relationshipTags, eq(relationshipTagAssignments.tagId, relationshipTags.id)).where(eq(relationshipTagAssignments.relationshipId, relationship.id)),
      ]);
      res.json({ ...relationship, identities, consents, notes, tasks, conversations: conversationsForRelationship, memories, tags: tagRows.map((row) => row.tag) });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/relationships/:relationshipId/timeline", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const limit = z.coerce.number().int().min(20).max(500).default(200).parse(req.query.limit);
      const conversationRows = await db.select({ id: relationshipConversations.id }).from(relationshipConversations).where(and(eq(relationshipConversations.businessId, relationship.businessId), eq(relationshipConversations.relationshipId, relationship.id)));
      const conversationIds = conversationRows.map((conversation) => conversation.id);
      const [messageRows, noteRows, conversationNoteRows, taskRows, consentRows, auditRows] = await Promise.all([
        conversationIds.length ? db.select().from(relationshipMessages).where(and(eq(relationshipMessages.businessId, relationship.businessId), inArray(relationshipMessages.conversationId, conversationIds))).orderBy(desc(relationshipMessages.occurredAt)).limit(limit) : Promise.resolve([]),
        db.select().from(relationshipNotes).where(and(eq(relationshipNotes.businessId, relationship.businessId), eq(relationshipNotes.relationshipId, relationship.id))).orderBy(desc(relationshipNotes.createdAt)).limit(limit),
        conversationIds.length ? db.select().from(relationshipConversationNotes).where(and(eq(relationshipConversationNotes.businessId, relationship.businessId), inArray(relationshipConversationNotes.conversationId, conversationIds))).orderBy(desc(relationshipConversationNotes.createdAt)).limit(limit) : Promise.resolve([]),
        db.select().from(relationshipTasks).where(and(eq(relationshipTasks.businessId, relationship.businessId), eq(relationshipTasks.relationshipId, relationship.id))).orderBy(desc(relationshipTasks.updatedAt)).limit(limit),
        db.select().from(relationshipConsents).where(and(eq(relationshipConsents.businessId, relationship.businessId), eq(relationshipConsents.relationshipId, relationship.id))).orderBy(desc(relationshipConsents.updatedAt)).limit(limit),
        db.select().from(relationshipAuditEvents).where(and(eq(relationshipAuditEvents.businessId, relationship.businessId), eq(relationshipAuditEvents.targetType, "relationship"), eq(relationshipAuditEvents.targetId, relationship.id))).orderBy(desc(relationshipAuditEvents.createdAt)).limit(limit),
      ]);
      const timeline = [
        ...messageRows.map((message) => ({ id: `message:${message.id}`, type: "message", occurredAt: message.occurredAt, title: `${message.direction === "inbound" ? "Received" : "Sent"} via ${message.provider}`, body: message.body, metadata: { conversationId: message.conversationId, direction: message.direction, provider: message.provider, status: message.status, syntheticMedia: message.syntheticMedia } })),
        ...noteRows.map((note) => ({ id: `note:${note.id}`, type: "note", occurredAt: note.createdAt, title: `${note.visibility === "private" ? "Private" : "Team"} note`, body: note.body, metadata: { visibility: note.visibility, sourceType: note.sourceType } })),
        ...conversationNoteRows.map((note) => ({ id: `conversation-note:${note.id}`, type: "note", occurredAt: note.createdAt, title: "Conversation note", body: note.body, metadata: { conversationId: note.conversationId } })),
        ...taskRows.map((task) => ({ id: `task:${task.id}`, type: "task", occurredAt: task.updatedAt, title: `Task ${task.status}: ${task.title}`, body: task.body, metadata: { status: task.status, priority: task.priority, dueAt: task.dueAt } })),
        ...consentRows.map((consent) => ({ id: `consent:${consent.id}`, type: "consent", occurredAt: consent.updatedAt, title: `${consent.channel} ${consent.purpose} consent: ${consent.status}`, body: "", metadata: { channel: consent.channel, purpose: consent.purpose, status: consent.status, source: consent.source } })),
        ...auditRows.map((event) => ({ id: `audit:${event.id}`, type: "audit", occurredAt: event.createdAt, title: event.action.replaceAll("_", " ").replaceAll(".", " "), body: "", metadata: event.metadata })),
      ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()).slice(0, limit);
      res.json({ relationshipId: relationship.id, items: timeline });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.patch("/api/relationship-hub/relationships/:relationshipId", attachUser, async (req, res) => {
    try {
      const existing = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const input = updateRelationshipSchema.parse(req.body);
      const [updated] = await db.update(relationships).set({ ...input, updatedAt: new Date(), archivedAt: input.status === "archived" ? new Date() : existing.archivedAt }).where(eq(relationships.id, existing.id)).returning();
      await auditRelationshipAction({ businessId: existing.businessId, actorUserId: req.dbUser!.id, action: "relationship.updated", targetType: "relationship", targetId: existing.id, metadata: { changedFields: Object.keys(input) } });
      res.json(updated);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/relationships/:relationshipId/consents", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const input = recordRelationshipConsentSchema.parse(req.body);
      const occurredAt = input.occurredAt ?? new Date();
      const consent = await recordRelationshipConsent({
        businessId: relationship.businessId,
        relationshipId: relationship.id,
        channel: input.channel.toLowerCase(),
        purpose: input.purpose.toLowerCase(),
        status: input.status,
        source: "operator_evidence",
        disclosureVersion: input.disclosureVersion,
        occurredAt,
        evidence: { note: input.evidenceNote, recordedByUserId: req.dbUser!.id, occurredAt: occurredAt.toISOString() },
      });
      await auditRelationshipAction({ businessId: relationship.businessId, actorUserId: req.dbUser!.id, action: "relationship_consent.recorded", targetType: "relationship_consent", targetId: consent.id, metadata: { relationshipId: relationship.id, channel: consent.channel, purpose: consent.purpose, status: consent.status } });
      res.status(201).json(consent);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/memories/:memoryId/review", attachUser, async (req, res) => {
    try {
      const input = reviewRelationshipMemorySchema.parse(req.body);
      const [memory] = await db.select().from(relationshipMemoryFacts).where(eq(relationshipMemoryFacts.id, z.string().uuid().parse(req.params.memoryId))).limit(1);
      if (!memory || !(await userCanManageBusiness(req.dbUser!.id, memory.businessId))) throw new Error("Relationship memory not found");
      if (memory.status !== "proposed") throw new Error("Relationship memory was already reviewed");
      const [reviewed] = await db.update(relationshipMemoryFacts).set({ status: input.decision === "accept" ? "accepted" : "rejected", reviewedByUserId: req.dbUser!.id, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(relationshipMemoryFacts.id, memory.id), eq(relationshipMemoryFacts.status, "proposed"))).returning();
      if (!reviewed) throw new Error("Relationship memory was already reviewed");
      await auditRelationshipAction({ businessId: memory.businessId, actorUserId: req.dbUser!.id, action: `relationship_memory.${reviewed.status}`, targetType: "relationship_memory", targetId: memory.id, metadata: { relationshipId: memory.relationshipId, factType: memory.factType } });
      res.json(reviewed);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/merge-candidates", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      const rows = await db.select().from(relationshipMergeCandidates).where(and(eq(relationshipMergeCandidates.businessId, businessId), eq(relationshipMergeCandidates.status, "suggested"))).orderBy(desc(relationshipMergeCandidates.confidence)).limit(200);
      const relationshipIds = Array.from(new Set(rows.flatMap((row) => [row.sourceRelationshipId, row.targetRelationshipId])));
      const candidates = relationshipIds.length ? await db.select({ id: relationships.id, displayName: relationships.displayName, avatarUrl: relationships.avatarUrl, status: relationships.status }).from(relationships).where(and(eq(relationships.businessId, businessId), inArray(relationships.id, relationshipIds))) : [];
      const byId = new Map(candidates.map((relationship) => [relationship.id, relationship]));
      res.json(rows.map((row) => ({ ...row, sourceRelationship: byId.get(row.sourceRelationshipId) ?? null, targetRelationship: byId.get(row.targetRelationshipId) ?? null })));
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/relationships/:relationshipId/merge-candidates", attachUser, async (req, res) => {
    try {
      const source = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const input = createMergeCandidateSchema.parse(req.body);
      const target = await ownedRelationship(req.dbUser!.id, input.targetRelationshipId);
      if (source.id === target.id || source.businessId !== target.businessId) throw new Error("Relationships must be distinct and belong to the same business");
      const [candidate] = await db.insert(relationshipMergeCandidates).values({ businessId: source.businessId, sourceRelationshipId: source.id, targetRelationshipId: target.id, reason: input.reason, confidence: input.confidence, evidence: [{ source: "manual_review" }] }).onConflictDoUpdate({ target: [relationshipMergeCandidates.businessId, relationshipMergeCandidates.sourceRelationshipId, relationshipMergeCandidates.targetRelationshipId], set: { reason: input.reason, confidence: input.confidence, status: "suggested", reviewedByUserId: null, reviewedAt: null } }).returning();
      await auditRelationshipAction({ businessId: source.businessId, actorUserId: req.dbUser!.id, action: "relationship_merge.proposed", targetType: "merge_candidate", targetId: candidate.id, metadata: { sourceRelationshipId: source.id, targetRelationshipId: target.id, confidence: candidate.confidence } });
      res.status(201).json(candidate);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/merge-candidates/:candidateId/review", attachUser, async (req, res) => {
    try {
      const input = reviewMergeCandidateSchema.parse(req.body);
      const [candidate] = await db.select().from(relationshipMergeCandidates).where(eq(relationshipMergeCandidates.id, req.params.candidateId)).limit(1);
      if (!candidate || candidate.status !== "suggested" || !(await userCanManageBusiness(req.dbUser!.id, candidate.businessId))) throw new Error("Relationship merge candidate not found");
      if (input.decision === "reject") {
        const [rejected] = await db.update(relationshipMergeCandidates).set({ status: "rejected", reviewedByUserId: req.dbUser!.id, reviewedAt: new Date() }).where(eq(relationshipMergeCandidates.id, candidate.id)).returning();
        await auditRelationshipAction({ businessId: candidate.businessId, actorUserId: req.dbUser!.id, action: "relationship_merge.rejected", targetType: "merge_candidate", targetId: candidate.id });
        return res.json(rejected);
      }
      const merged = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${candidate.businessId + ":" + candidate.sourceRelationshipId + ":" + candidate.targetRelationshipId}))`);
        const [source] = await tx.select().from(relationships).where(eq(relationships.id, candidate.sourceRelationshipId)).limit(1);
        const [target] = await tx.select().from(relationships).where(eq(relationships.id, candidate.targetRelationshipId)).limit(1);
        if (!source || !target || source.status === "archived" || source.businessId !== target.businessId) throw new Error("Relationship merge is no longer valid");
        const sourceIdentities = await tx.select().from(relationshipExternalIdentities).where(eq(relationshipExternalIdentities.relationshipId, source.id));
        for (const identity of sourceIdentities) {
          const [duplicate] = await tx.select({ id: relationshipExternalIdentities.id }).from(relationshipExternalIdentities).where(and(eq(relationshipExternalIdentities.relationshipId, target.id), eq(relationshipExternalIdentities.provider, identity.provider), eq(relationshipExternalIdentities.providerSubjectId, identity.providerSubjectId))).limit(1);
          if (duplicate) await tx.delete(relationshipExternalIdentities).where(eq(relationshipExternalIdentities.id, identity.id));
          else await tx.update(relationshipExternalIdentities).set({ relationshipId: target.id, updatedAt: new Date() }).where(eq(relationshipExternalIdentities.id, identity.id));
        }
        const sourceAssignments = await tx.select().from(relationshipTagAssignments).where(eq(relationshipTagAssignments.relationshipId, source.id));
        for (const assignment of sourceAssignments) {
          await tx.insert(relationshipTagAssignments).values({ ...assignment, id: undefined, relationshipId: target.id }).onConflictDoNothing();
        }
        await tx.delete(relationshipTagAssignments).where(eq(relationshipTagAssignments.relationshipId, source.id));
        // Keep transaction statements sequential. This remains compatible with
        // single-connection Postgres drivers and avoids partial merge behavior
        // when a hosted driver does not permit concurrent statements in a tx.
        await tx.update(relationshipConsents).set({ relationshipId: target.id, updatedAt: new Date() }).where(eq(relationshipConsents.relationshipId, source.id));
        await tx.update(relationshipNotes).set({ relationshipId: target.id, updatedAt: new Date() }).where(eq(relationshipNotes.relationshipId, source.id));
        await tx.update(relationshipTasks).set({ relationshipId: target.id, updatedAt: new Date() }).where(eq(relationshipTasks.relationshipId, source.id));
        await tx.update(relationshipConversations).set({ relationshipId: target.id, updatedAt: new Date() }).where(eq(relationshipConversations.relationshipId, source.id));
        await tx.update(relationshipConversationParticipants).set({ relationshipId: target.id }).where(eq(relationshipConversationParticipants.relationshipId, source.id));
        await tx.update(relationshipMemoryFacts).set({ relationshipId: target.id, updatedAt: new Date() }).where(eq(relationshipMemoryFacts.relationshipId, source.id));
        await tx.update(relationshipAgentSuggestions).set({ relationshipId: target.id }).where(eq(relationshipAgentSuggestions.relationshipId, source.id));
        const [updatedTarget] = await tx.update(relationships).set({ avatarUrl: target.avatarUrl ?? source.avatarUrl, locale: target.locale ?? source.locale, timezone: target.timezone ?? source.timezone, customFields: { ...source.customFields, ...target.customFields }, lastInteractionAt: !target.lastInteractionAt || (source.lastInteractionAt && source.lastInteractionAt > target.lastInteractionAt) ? source.lastInteractionAt : target.lastInteractionAt, updatedAt: new Date() }).where(eq(relationships.id, target.id)).returning();
        await tx.update(relationships).set({ status: "archived", archivedAt: new Date(), customFields: { ...source.customFields, mergedIntoRelationshipId: target.id }, updatedAt: new Date() }).where(eq(relationships.id, source.id));
        await tx.update(relationshipMergeCandidates).set({ status: "merged", reviewedByUserId: req.dbUser!.id, reviewedAt: new Date() }).where(eq(relationshipMergeCandidates.id, candidate.id));
        await tx.insert(relationshipAuditEvents).values({ businessId: candidate.businessId, actorUserId: req.dbUser!.id, action: "relationship.merged", targetType: "relationship", targetId: target.id, metadata: { sourceRelationshipId: source.id, mergeCandidateId: candidate.id } });
        return updatedTarget;
      });
      res.json(merged);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/relationships/:relationshipId/notes", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const input = createNoteSchema.parse(req.body);
      const [note] = await db.insert(relationshipNotes).values({ businessId: relationship.businessId, relationshipId: relationship.id, authorUserId: req.dbUser!.id, body: input.body, visibility: input.visibility }).returning();
      await auditRelationshipAction({ businessId: relationship.businessId, actorUserId: req.dbUser!.id, action: "relationship_note.created", targetType: "relationship_note", targetId: note.id, metadata: { relationshipId: relationship.id, visibility: note.visibility } });
      res.status(201).json(note);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/relationships/:relationshipId/tasks", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const input = createTaskSchema.parse(req.body);
      const [task] = await db.insert(relationshipTasks).values({ businessId: relationship.businessId, relationshipId: relationship.id, createdByUserId: req.dbUser!.id, assignedToUserId: input.assignedToUserId ?? req.dbUser!.id, title: input.title, body: input.body, priority: input.priority, dueAt: input.dueAt ?? null }).returning();
      await auditRelationshipAction({ businessId: relationship.businessId, actorUserId: req.dbUser!.id, action: "relationship_task.created", targetType: "relationship_task", targetId: task.id, metadata: { relationshipId: relationship.id, assignedToUserId: task.assignedToUserId, priority: task.priority } });
      res.status(201).json(task);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.patch("/api/relationship-hub/tasks/:taskId", attachUser, async (req, res) => {
    try {
      const input = updateTaskSchema.parse(req.body);
      const [task] = await db.select().from(relationshipTasks).where(eq(relationshipTasks.id, req.params.taskId)).limit(1);
      if (!task || !(await userCanManageBusiness(req.dbUser!.id, task.businessId))) throw new Error("Relationship task not found");
      const [updated] = await db.update(relationshipTasks).set({ status: input.status, completedAt: input.status === "completed" ? new Date() : null, updatedAt: new Date() }).where(eq(relationshipTasks.id, task.id)).returning();
      await auditRelationshipAction({ businessId: task.businessId, actorUserId: req.dbUser!.id, action: "relationship_task.updated", targetType: "relationship_task", targetId: task.id, metadata: { relationshipId: task.relationshipId, status: updated.status } });
      res.json(updated);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/relationships/:relationshipId/tags", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      const input = createTagSchema.parse(req.body);
      const tag = await db.transaction(async (tx) => {
        const [created] = await tx.insert(relationshipTags).values({ businessId: relationship.businessId, name: input.name, color: input.color ?? null }).onConflictDoNothing().returning();
        const [existing] = created ? [created] : await tx.select().from(relationshipTags).where(and(eq(relationshipTags.businessId, relationship.businessId), eq(relationshipTags.name, input.name))).limit(1);
        if (!existing) throw new Error("Relationship tag could not be created");
        await tx.insert(relationshipTagAssignments).values({ businessId: relationship.businessId, relationshipId: relationship.id, tagId: existing.id, assignedByUserId: req.dbUser!.id }).onConflictDoNothing();
        return existing;
      });
      await auditRelationshipAction({ businessId: relationship.businessId, actorUserId: req.dbUser!.id, action: "relationship_tag.assigned", targetType: "relationship_tag", targetId: tag.id, metadata: { relationshipId: relationship.id, name: tag.name } });
      res.status(201).json(tag);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.delete("/api/relationship-hub/relationships/:relationshipId/tags/:tagId", attachUser, async (req, res) => {
    try {
      const relationship = await ownedRelationship(req.dbUser!.id, req.params.relationshipId);
      await db.delete(relationshipTagAssignments).where(and(eq(relationshipTagAssignments.businessId, relationship.businessId), eq(relationshipTagAssignments.relationshipId, relationship.id), eq(relationshipTagAssignments.tagId, req.params.tagId)));
      await auditRelationshipAction({ businessId: relationship.businessId, actorUserId: req.dbUser!.id, action: "relationship_tag.removed", targetType: "relationship_tag", targetId: req.params.tagId, metadata: { relationshipId: relationship.id } });
      res.status(204).end();
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/conversations", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      const statuses = typeof req.query.status === "string" && req.query.status !== "all" ? [req.query.status] : ["open", "pending", "snoozed"];
      const rows = await db.select({ conversation: relationshipConversations, relationship: relationships }).from(relationshipConversations).leftJoin(relationships, eq(relationshipConversations.relationshipId, relationships.id)).where(and(eq(relationshipConversations.businessId, businessId), inArray(relationshipConversations.status, statuses))).orderBy(desc(relationshipConversations.updatedAt)).limit(200);
      res.json(rows.map((row) => ({ ...row.conversation, relationship: row.relationship })));
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/conversations/:conversationId", attachUser, async (req, res) => {
    try {
      const conversation = await ownedConversation(req.dbUser!.id, req.params.conversationId);
      const [relationship, bindings, participants, messages, notes, suggestions] = await Promise.all([
        conversation.relationshipId ? db.select().from(relationships).where(eq(relationships.id, conversation.relationshipId)).limit(1) : Promise.resolve([]),
        db.select().from(relationshipConversationBindings).where(eq(relationshipConversationBindings.conversationId, conversation.id)),
        db.select().from(relationshipConversationParticipants).where(eq(relationshipConversationParticipants.conversationId, conversation.id)),
        db.select().from(relationshipMessages).where(eq(relationshipMessages.conversationId, conversation.id)).orderBy(asc(relationshipMessages.occurredAt)).limit(500),
        db.select().from(relationshipConversationNotes).where(eq(relationshipConversationNotes.conversationId, conversation.id)).orderBy(asc(relationshipConversationNotes.createdAt)).limit(200),
        db.select().from(relationshipAgentSuggestions).where(and(eq(relationshipAgentSuggestions.conversationId, conversation.id), eq(relationshipAgentSuggestions.status, "proposed"))).orderBy(desc(relationshipAgentSuggestions.createdAt)).limit(50),
      ]);
      const messageIds = messages.map((message) => message.id);
      const [attachments, receipts] = messageIds.length ? await Promise.all([
        db.select().from(relationshipMessageAttachments).where(inArray(relationshipMessageAttachments.messageId, messageIds)),
        db.select().from(relationshipMessageReceipts).where(inArray(relationshipMessageReceipts.messageId, messageIds)).orderBy(asc(relationshipMessageReceipts.occurredAt)),
      ]) : [[], []];
      res.json({ ...conversation, relationship: relationship[0] ?? null, bindings, participants, messages: messages.map((message) => ({ ...message, attachments: attachments.filter((attachment) => attachment.messageId === message.id), receipts: receipts.filter((receipt) => receipt.messageId === message.id) })), notes, suggestions });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.patch("/api/relationship-hub/conversations/:conversationId", attachUser, async (req, res) => {
    try {
      const conversation = await ownedConversation(req.dbUser!.id, req.params.conversationId);
      const input = conversationUpdateSchema.parse(req.body);
      const [updated] = await db.update(relationshipConversations).set({ ...input, closedAt: input.status === "closed" ? new Date() : conversation.closedAt, updatedAt: new Date() }).where(eq(relationshipConversations.id, conversation.id)).returning();
      await auditRelationshipAction({ businessId: conversation.businessId, actorUserId: req.dbUser!.id, action: "conversation.updated", targetType: "conversation", targetId: conversation.id, metadata: { changedFields: Object.keys(input) } });
      res.json(updated);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/conversations/:conversationId/messages", attachUser, async (req, res) => {
    try {
      const conversation = await ownedConversation(req.dbUser!.id, req.params.conversationId);
      const input = sendMessageSchema.parse(req.body);
      const bindings = await db.select().from(relationshipConversationBindings).where(eq(relationshipConversationBindings.conversationId, conversation.id));
      const binding = input.connectionId ? bindings.find((candidate) => candidate.connectionId === input.connectionId) : bindings.find((candidate) => candidate.status === "active");
      if (!binding?.connectionId) throw new Error("Conversation has no active channel connection");
      const queued = await queueRelationshipMessage({
        businessId: conversation.businessId,
        conversationId: conversation.id,
        connectionId: binding.connectionId,
        authorUserId: req.dbUser!.id,
        action: {
          version: "relationship.action.v1",
          actionType: input.actionType,
          idempotencyKey: input.idempotencyKey ?? `inbox:${conversation.id}:${crypto.randomUUID()}`,
          externalThreadId: binding.externalThreadId,
          body: input.body,
          bodyFormat: input.bodyFormat,
          replyToExternalMessageId: input.replyToExternalMessageId,
          attachments: input.attachments,
          metadata: {},
        },
      });
      if (!queued.duplicate) void processRelationshipDeliveryJob(queued.job.id).catch((error) => console.error("Immediate Relationship Hub delivery failed", { errorType: error instanceof Error ? error.name : typeof error }));
      res.status(202).json(queued);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/conversations/:conversationId/notes", attachUser, async (req, res) => {
    try {
      const conversation = await ownedConversation(req.dbUser!.id, req.params.conversationId);
      const input = createNoteSchema.parse(req.body);
      const [note] = await db.insert(relationshipConversationNotes).values({ businessId: conversation.businessId, conversationId: conversation.id, authorUserId: req.dbUser!.id, body: input.body }).returning();
      await auditRelationshipAction({ businessId: conversation.businessId, actorUserId: req.dbUser!.id, action: "conversation_note.created", targetType: "conversation_note", targetId: note.id, metadata: { conversationId: conversation.id } });
      res.status(201).json(note);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/ai/status", attachUser, async (req, res) => {
    try {
      await managedBusiness(req, req.query.businessId);
      res.json(relationshipAiProviderStatus());
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/conversations/:conversationId/ai/suggestions", attachUser, async (req, res) => {
    try {
      const conversation = await ownedConversation(req.dbUser!.id, req.params.conversationId);
      const input = relationshipAiSuggestSchema.parse(req.body ?? {});
      const result = await generateRelationshipSuggestions({
        businessId: conversation.businessId,
        conversationId: conversation.id,
        agentKey: input.agentKey,
        requestedByUserId: req.dbUser!.id,
      });
      res.status(201).json(result);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/suggestions/:suggestionId/review", attachUser, async (req, res) => {
    const input = relationshipSuggestionReviewSchema.safeParse(req.body);
    if (!input.success) return relationshipHubError(res, input.error);
    let claimed: typeof relationshipAgentSuggestions.$inferSelect | undefined;
    try {
      const [suggestion] = await db.select().from(relationshipAgentSuggestions).where(eq(relationshipAgentSuggestions.id, req.params.suggestionId)).limit(1);
      if (!suggestion || !(await userCanManageBusiness(req.dbUser!.id, suggestion.businessId))) throw new Error("Relationship suggestion not found");
      if (suggestion.status !== "proposed") throw new Error("Relationship suggestion was already reviewed");
      if (input.data.decision === "reject") {
        const [rejected] = await db.update(relationshipAgentSuggestions).set({ status: "rejected", reviewedByUserId: req.dbUser!.id, reviewedAt: new Date() }).where(and(eq(relationshipAgentSuggestions.id, suggestion.id), eq(relationshipAgentSuggestions.status, "proposed"))).returning();
        if (!rejected) throw new Error("Relationship suggestion was already reviewed");
        await auditRelationshipAction({ businessId: suggestion.businessId, actorUserId: req.dbUser!.id, action: "ai_suggestion.rejected", targetType: "agent_suggestion", targetId: suggestion.id, metadata: { suggestionType: suggestion.suggestionType } });
        return res.json(rejected);
      }
      const authorityConversation = suggestion.conversationId ? await ownedConversation(req.dbUser!.id, suggestion.conversationId) : null;
      const [authorityPolicy] = await db.select().from(relationshipAgentAuthorityPolicies).where(and(eq(relationshipAgentAuthorityPolicies.businessId, suggestion.businessId), eq(relationshipAgentAuthorityPolicies.agentKey, suggestion.agentKey), eq(relationshipAgentAuthorityPolicies.status, "active"))).limit(1);
      const [authorityBinding] = authorityConversation ? await db.select().from(relationshipConversationBindings).where(and(eq(relationshipConversationBindings.conversationId, authorityConversation.id), eq(relationshipConversationBindings.status, "active"))).limit(1) : [];
      const authorityDecision = relationshipAgentDecision({
        mode: authorityPolicy?.mode ?? "approval",
        action: relationshipSuggestionAction(suggestion.suggestionType as Parameters<typeof relationshipSuggestionAction>[0]),
        allowedActions: authorityPolicy?.allowedActions ?? defaultRelationshipAgentActions,
        approvalRequiredActions: authorityPolicy?.approvalRequiredActions ?? defaultRelationshipAgentActions,
        blockedActions: authorityPolicy?.blockedActions ?? [],
        provider: authorityBinding?.provider ?? "native",
        channelAllowlist: authorityPolicy?.channelAllowlist ?? [],
      });
      if (authorityDecision === "blocked") throw new Error("Current agent authority policy blocks this suggestion");
      [claimed] = await db.update(relationshipAgentSuggestions).set({ status: "executing", reviewedByUserId: req.dbUser!.id, reviewedAt: new Date() }).where(and(eq(relationshipAgentSuggestions.id, suggestion.id), eq(relationshipAgentSuggestions.status, "proposed"))).returning();
      if (!claimed) throw new Error("Relationship suggestion was already reviewed");
      const conversation = claimed.conversationId ? await ownedConversation(req.dbUser!.id, claimed.conversationId) : null;
      if (claimed.suggestionType === "reply") {
        if (!conversation) throw new Error("Reply suggestion has no conversation");
        const [binding] = await db.select().from(relationshipConversationBindings).where(and(eq(relationshipConversationBindings.conversationId, conversation.id), eq(relationshipConversationBindings.status, "active"))).limit(1);
        if (!binding?.connectionId) throw new Error("Conversation has no active channel connection");
        const queued = await queueRelationshipMessage({
          businessId: conversation.businessId,
          conversationId: conversation.id,
          connectionId: binding.connectionId,
          authorUserId: req.dbUser!.id,
          authorType: "agent",
          action: {
            version: "relationship.action.v1",
            actionType: "message.send",
            idempotencyKey: `ai-suggestion:${claimed.id}`,
            externalThreadId: binding.externalThreadId,
            body: claimed.body,
            bodyFormat: "plain",
            attachments: [],
            metadata: { suggestionId: claimed.id, humanApprovedByUserId: req.dbUser!.id },
          },
        });
        if (!queued.duplicate) void processRelationshipDeliveryJob(queued.job.id).catch((error) => console.error("Approved AI reply delivery failed", { errorType: error instanceof Error ? error.name : typeof error }));
      } else if (claimed.suggestionType === "summary" && claimed.relationshipId) {
        await db.update(relationships).set({ aiSummary: claimed.body, updatedAt: new Date() }).where(eq(relationships.id, claimed.relationshipId));
      } else if (claimed.suggestionType === "follow_up_task" && claimed.relationshipId) {
        await db.insert(relationshipTasks).values({ businessId: claimed.businessId, relationshipId: claimed.relationshipId, createdByUserId: req.dbUser!.id, assignedToUserId: req.dbUser!.id, title: claimed.title, body: claimed.body });
      } else if (claimed.suggestionType === "internal_note" && claimed.relationshipId) {
        await db.insert(relationshipNotes).values({ businessId: claimed.businessId, relationshipId: claimed.relationshipId, authorUserId: req.dbUser!.id, body: claimed.body, visibility: "team", sourceType: "agent", sourceId: claimed.id });
      } else if (claimed.suggestionType === "escalation" && conversation) {
        await db.update(relationshipConversations).set({ priority: "urgent", queue: "human_escalation", assignedToUserId: req.dbUser!.id, updatedAt: new Date() }).where(eq(relationshipConversations.id, conversation.id));
      }
      const [executed] = await db.update(relationshipAgentSuggestions).set({ status: "executed" }).where(eq(relationshipAgentSuggestions.id, claimed.id)).returning();
      await auditRelationshipAction({ businessId: claimed.businessId, actorUserId: req.dbUser!.id, action: "ai_suggestion.executed", targetType: "agent_suggestion", targetId: claimed.id, metadata: { suggestionType: claimed.suggestionType } });
      return res.json(executed);
    } catch (error) {
      if (claimed) await db.update(relationshipAgentSuggestions).set({ status: "proposed", reviewedByUserId: null, reviewedAt: null }).where(and(eq(relationshipAgentSuggestions.id, claimed.id), eq(relationshipAgentSuggestions.status, "executing"))).catch(() => undefined);
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/agent-policies", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      const policies = await db.select().from(relationshipAgentAuthorityPolicies).where(eq(relationshipAgentAuthorityPolicies.businessId, businessId)).orderBy(asc(relationshipAgentAuthorityPolicies.role));
      res.json(policies);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/agent-policies", attachUser, async (req, res) => {
    try {
      const input = agentPolicySchema.parse(req.body);
      const businessId = await administeredBusiness(req, input.businessId);
      const [policy] = await db.insert(relationshipAgentAuthorityPolicies).values({ ...input, businessId, createdByUserId: req.dbUser!.id }).onConflictDoUpdate({
        target: [relationshipAgentAuthorityPolicies.businessId, relationshipAgentAuthorityPolicies.agentKey],
        set: { role: input.role, mode: input.mode, allowedActions: input.allowedActions, approvalRequiredActions: input.approvalRequiredActions, blockedActions: input.blockedActions, channelAllowlist: input.channelAllowlist, maxCostUnitsPerRun: input.maxCostUnitsPerRun, instructions: input.instructions, updatedAt: new Date() },
      }).returning();
      await auditRelationshipAction({ businessId, actorUserId: req.dbUser!.id, action: "agent_policy.updated", targetType: "agent_policy", targetId: policy.id, metadata: { agentKey: policy.agentKey, mode: policy.mode, allowedActions: policy.allowedActions, approvalRequiredActions: policy.approvalRequiredActions } });
      res.status(201).json(policy);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/voice-profiles", attachUser, async (req, res) => {
    try {
      const businessId = await managedBusiness(req, req.query.businessId);
      const profiles = await db.select().from(relationshipVoiceProfiles).where(and(eq(relationshipVoiceProfiles.businessId, businessId), eq(relationshipVoiceProfiles.ownerUserId, req.dbUser!.id))).orderBy(desc(relationshipVoiceProfiles.createdAt));
      res.json(profiles.map(({ providerVoiceIdCiphertext: _secret, ...profile }) => profile));
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/voice-providers", attachUser, async (req, res) => {
    try {
      await managedBusiness(req, req.query.businessId);
      res.json(relationshipVoiceProviderStatus());
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/voice-profiles", attachUser, async (req, res) => {
    try {
      const input = voiceProfileSchema.parse(req.body);
      const businessId = await managedBusiness(req, input.businessId);
      const [profile] = await db.insert(relationshipVoiceProfiles).values({ businessId, ownerUserId: req.dbUser!.id, provider: input.provider, displayName: input.displayName, cloneType: input.cloneType, allowedUseCases: input.allowedUseCases, blockedUseCases: input.blockedUseCases, status: "enrollment_required", ownershipVerificationStatus: "unverified" }).returning();
      await auditRelationshipAction({ businessId, actorUserId: req.dbUser!.id, action: "voice_profile.created", targetType: "voice_profile", targetId: profile.id, metadata: { provider: profile.provider, cloneType: profile.cloneType } });
      const { providerVoiceIdCiphertext: _secret, ...safeProfile } = profile;
      res.status(201).json(safeProfile);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/voice-profiles/:profileId/revoke", attachUser, async (req, res) => {
    try {
      const [profile] = await db.select().from(relationshipVoiceProfiles).where(and(eq(relationshipVoiceProfiles.id, req.params.profileId), eq(relationshipVoiceProfiles.ownerUserId, req.dbUser!.id))).limit(1);
      if (!profile || !(await userCanManageBusiness(req.dbUser!.id, profile.businessId))) throw new Error("Voice profile not found");
      const [revoked] = await db.transaction(async (tx) => {
        const [updated] = await tx.update(relationshipVoiceProfiles).set({ status: "revoked", revokedAt: new Date(), providerVoiceIdCiphertext: null, updatedAt: new Date() }).where(eq(relationshipVoiceProfiles.id, profile.id)).returning();
        await tx.update(relationshipVoiceConsents).set({ status: "withdrawn", withdrawnAt: new Date() }).where(eq(relationshipVoiceConsents.voiceProfileId, profile.id));
        await tx.update(relationshipVoiceGenerationJobs).set({ status: "canceled", errorCode: "voice_revoked", errorMessage: "Voice owner revoked future use", updatedAt: new Date() }).where(and(eq(relationshipVoiceGenerationJobs.voiceProfileId, profile.id), inArray(relationshipVoiceGenerationJobs.status, ["awaiting_approval", "queued", "generating"])));
        return [updated];
      });
      const { providerVoiceIdCiphertext: _secret, ...safeProfile } = revoked;
      await auditRelationshipAction({ businessId: profile.businessId, actorUserId: req.dbUser!.id, action: "voice_profile.revoked", targetType: "voice_profile", targetId: profile.id });
      res.json(safeProfile);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/voice-profiles/:profileId/verify", attachUser, async (req, res) => {
    try {
      const input = verifyVoiceProfileSchema.parse(req.body);
      const profile = await verifyRelationshipVoiceProfile({ profileId: req.params.profileId, ownerUserId: req.dbUser!.id, ...input });
      if (!(await userCanManageBusiness(req.dbUser!.id, profile.businessId))) throw new Error("Voice profile not found");
      const { providerVoiceIdCiphertext: _providerVoice, ...safeProfile } = profile;
      await auditRelationshipAction({ businessId: profile.businessId, actorUserId: req.dbUser!.id, action: "voice_profile.verified", targetType: "voice_profile", targetId: profile.id, metadata: { provider: profile.provider, method: profile.ownershipVerificationStatus } });
      res.json(safeProfile);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/conversations/:conversationId/voice-messages", attachUser, async (req, res) => {
    try {
      const conversation = await ownedConversation(req.dbUser!.id, req.params.conversationId);
      const input = createVoiceMessageSchema.parse(req.body);
      const job = await createRelationshipVoiceJob({ conversationId: conversation.id, requestedByUserId: req.dbUser!.id, ...input });
      await auditRelationshipAction({ businessId: conversation.businessId, actorUserId: req.dbUser!.id, action: "voice_message.requested", targetType: "voice_generation_job", targetId: job.id, metadata: { sourceType: job.sourceType, approvalRequired: job.status === "awaiting_approval" } });
      if (job.status === "awaiting_approval") return res.status(202).json({ job: safeVoiceJob(job), approvalRequired: true });
      const delivered = await deliverGeneratedVoiceJob({ jobId: job.id, userId: req.dbUser!.id });
      res.status(202).json({ job: safeVoiceJob(delivered.job), delivery: delivered.delivery, approvalRequired: false });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.post("/api/relationship-hub/voice-jobs/:jobId/approve-and-send", attachUser, async (req, res) => {
    try {
      const [job] = await db.select().from(relationshipVoiceGenerationJobs).where(eq(relationshipVoiceGenerationJobs.id, req.params.jobId)).limit(1);
      if (!job || !(await userCanManageBusiness(req.dbUser!.id, job.businessId))) throw new Error("Voice generation job not found");
      const [profile] = await db.select().from(relationshipVoiceProfiles).where(and(eq(relationshipVoiceProfiles.id, job.voiceProfileId), eq(relationshipVoiceProfiles.ownerUserId, req.dbUser!.id))).limit(1);
      if (!profile) throw new Error("Only the verified voice owner can approve this message");
      const [approved] = await db.update(relationshipVoiceGenerationJobs).set({ status: "queued", approvedByUserId: req.dbUser!.id, updatedAt: new Date() }).where(and(eq(relationshipVoiceGenerationJobs.id, job.id), eq(relationshipVoiceGenerationJobs.status, "awaiting_approval"))).returning();
      if (!approved) throw new Error("Voice generation job was already reviewed");
      const delivered = await deliverGeneratedVoiceJob({ jobId: approved.id, userId: req.dbUser!.id });
      res.status(202).json({ job: safeVoiceJob(delivered.job), delivery: delivered.delivery });
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });

  app.get("/api/relationship-hub/voice-jobs/:jobId/audio", attachUser, async (req, res) => {
    try {
      const [job] = await db.select().from(relationshipVoiceGenerationJobs).where(eq(relationshipVoiceGenerationJobs.id, req.params.jobId)).limit(1);
      if (!job?.conversationId || !(await canAccessConversationAudio(req.dbUser!.id, job.conversationId, job.businessId))) throw new Error("Voice message not found");
      const read = await relationshipVoiceReadUrl({ jobId: job.id, userId: req.dbUser!.id, businessId: job.businessId });
      if (read.url.startsWith("/")) {
        const localPath = path.resolve(process.cwd(), read.url.slice(1));
        if (!localPath.startsWith(path.resolve(process.cwd()))) throw new Error("Voice message storage path is invalid");
        return res.sendFile(localPath);
      }
      res.redirect(302, read.url);
    } catch (error) {
      return relationshipHubError(res, error);
    }
  });
}
