import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import {
  relationshipConversations,
  relationshipVoiceConsents,
  relationshipVoiceGenerationJobs,
  relationshipVoiceProfiles,
} from "../shared/schema";
import { createPrivateAssetReadUrl, persistPrivateBuffer } from "./asset-storage";
import { decryptSocialToken, encryptSocialToken } from "./social-oauth";
import { assertVoiceGenerationAllowed } from "./relationship-hub-policy";
import { assertRelationshipUsageAvailable, recordRelationshipUsage } from "./relationship-operations";

type VoiceGeneration = {
  audio: Buffer;
  mimeType: string;
  providerRequestId?: string;
  durationMs?: number;
};

type VoiceValidation = { displayName: string; metadata: Record<string, unknown> };

interface RelationshipVoiceProvider {
  id: string;
  configured(): boolean;
  validateVoice(voiceId: string): Promise<VoiceValidation>;
  generate(input: { voiceId: string; script: string }): Promise<VoiceGeneration>;
}

const elevenLabsProvider: RelationshipVoiceProvider = {
  id: "elevenlabs",
  configured: () => Boolean(process.env.ELEVENLABS_API_KEY),
  async validateVoice(voiceId) {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ElevenLabs is not configured");
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    });
    if (!response.ok) throw new Error(`ElevenLabs voice validation failed (${response.status})`);
    const body = await response.json() as { name?: string; category?: string; fine_tuning?: { state?: Record<string, string> } };
    return { displayName: body.name ?? "Verified voice", metadata: { category: body.category ?? null, fineTuningState: body.fine_tuning?.state ?? null } };
  },
  async generate({ voiceId, script }) {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ElevenLabs is not configured");
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: script, model_id: process.env.ELEVENLABS_VOICE_MODEL || "eleven_multilingual_v2" }),
    });
    if (!response.ok) throw new Error(`ElevenLabs voice generation failed (${response.status})`);
    return {
      audio: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
      providerRequestId: response.headers.get("request-id") ?? undefined,
    };
  },
};

const voiceProviders = new Map<string, RelationshipVoiceProvider>([[elevenLabsProvider.id, elevenLabsProvider]]);

function voiceProvider(id: string) {
  const provider = voiceProviders.get(id);
  if (!provider) throw new Error("Unsupported voice provider");
  if (!provider.configured()) throw new Error(`${id} voice provider is not configured`);
  return provider;
}

export function relationshipVoiceProviderStatus() {
  return Array.from(voiceProviders.values()).map((provider) => ({ provider: provider.id, configured: provider.configured() }));
}

export async function verifyRelationshipVoiceProfile(input: {
  profileId: string;
  ownerUserId: number;
  providerVoiceId: string;
  ownerAttestation: boolean;
  consentText: string;
}) {
  if (!input.ownerAttestation) throw new Error("The voice owner attestation is required");
  const [profile] = await db.select().from(relationshipVoiceProfiles).where(and(
    eq(relationshipVoiceProfiles.id, input.profileId),
    eq(relationshipVoiceProfiles.ownerUserId, input.ownerUserId),
  )).limit(1);
  if (!profile || profile.status === "revoked") throw new Error("Voice profile not found");
  const provider = voiceProvider(profile.provider);
  const validation = await provider.validateVoice(input.providerVoiceId);
  const consentVersion = "relationship-voice-v1";
  const consentHash = crypto.createHash("sha256").update(input.consentText).digest("hex");
  const [verified] = await db.transaction(async (tx) => {
    const [updated] = await tx.update(relationshipVoiceProfiles).set({
      providerVoiceIdCiphertext: encryptSocialToken(input.providerVoiceId),
      status: "active",
      ownershipVerificationStatus: "provider_account_and_owner_attestation",
      ownershipVerifiedAt: new Date(),
      metadata: { ...profile.metadata, providerDisplayName: validation.displayName, ...validation.metadata },
      updatedAt: new Date(),
    }).where(eq(relationshipVoiceProfiles.id, profile.id)).returning();
    await tx.insert(relationshipVoiceConsents).values({
      businessId: profile.businessId,
      voiceProfileId: profile.id,
      ownerUserId: profile.ownerUserId,
      consentVersion,
      consentTextHash: consentHash,
      status: "granted",
      verificationEvidence: { provider: profile.provider, method: "provider_account_and_owner_attestation" },
    }).onConflictDoUpdate({
      target: [relationshipVoiceConsents.voiceProfileId, relationshipVoiceConsents.consentVersion],
      set: { consentTextHash: consentHash, status: "granted", withdrawnAt: null, grantedAt: new Date() },
    });
    return [updated];
  });
  return verified;
}

export async function createRelationshipVoiceJob(input: {
  profileId: string;
  conversationId: string;
  requestedByUserId: number;
  script: string;
  useCase: string;
  sourceType: "human" | "agent";
}) {
  const estimatedSeconds = Math.max(1, Math.ceil(input.script.trim().split(/\s+/).length / 2.5));
  const [profile] = await db.select().from(relationshipVoiceProfiles).where(and(
    eq(relationshipVoiceProfiles.id, input.profileId),
    eq(relationshipVoiceProfiles.ownerUserId, input.requestedByUserId),
  )).limit(1);
  if (!profile) throw new Error("Voice profile not found");
  const [conversation] = await db.select().from(relationshipConversations).where(and(
    eq(relationshipConversations.id, input.conversationId),
    eq(relationshipConversations.businessId, profile.businessId),
  )).limit(1);
  if (!conversation) throw new Error("Relationship conversation not found");
  await assertRelationshipUsageAvailable({ businessId: profile.businessId, metric: "voice.second", quantity: estimatedSeconds });
  const [consent] = await db.select().from(relationshipVoiceConsents).where(and(
    eq(relationshipVoiceConsents.voiceProfileId, profile.id),
    eq(relationshipVoiceConsents.status, "granted"),
  )).limit(1);
  const approvedByUserId = input.sourceType === "human" ? input.requestedByUserId : null;
  assertVoiceGenerationAllowed({
    ownershipVerified: profile.ownershipVerificationStatus !== "unverified",
    consentActive: Boolean(consent),
    revoked: profile.status === "revoked",
    useCase: input.useCase,
    approvedByUserId,
    sourceType: input.sourceType,
  });
  const [job] = await db.insert(relationshipVoiceGenerationJobs).values({
    businessId: profile.businessId,
    voiceProfileId: profile.id,
    conversationId: conversation.id,
    requestedByUserId: input.requestedByUserId,
    approvedByUserId,
    sourceType: input.sourceType,
    scriptCiphertext: encryptSocialToken(input.script),
    scriptHash: crypto.createHash("sha256").update(input.script).digest("hex"),
    status: approvedByUserId ? "queued" : "awaiting_approval",
    provenance: { useCase: input.useCase, disclosure: profile.disclosureText },
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
  }).returning();
  return job;
}

export async function processRelationshipVoiceJob(jobId: string) {
  const [job] = await db.update(relationshipVoiceGenerationJobs).set({ status: "generating", updatedAt: new Date() }).where(and(
    eq(relationshipVoiceGenerationJobs.id, jobId),
    eq(relationshipVoiceGenerationJobs.status, "queued"),
  )).returning();
  if (!job) return null;
  try {
    const [profile] = await db.select().from(relationshipVoiceProfiles).where(eq(relationshipVoiceProfiles.id, job.voiceProfileId)).limit(1);
    if (!profile?.providerVoiceIdCiphertext) throw new Error("Voice profile is no longer available");
    const [consent] = await db.select().from(relationshipVoiceConsents).where(and(eq(relationshipVoiceConsents.voiceProfileId, profile.id), eq(relationshipVoiceConsents.status, "granted"))).limit(1);
    const useCase = typeof job.provenance.useCase === "string" ? job.provenance.useCase : "relationship_follow_up";
    assertVoiceGenerationAllowed({ ownershipVerified: profile.ownershipVerificationStatus !== "unverified", consentActive: Boolean(consent), revoked: profile.status === "revoked", useCase, approvedByUserId: job.approvedByUserId, sourceType: job.sourceType });
    const script = decryptSocialToken(job.scriptCiphertext);
    const generated = await voiceProvider(profile.provider).generate({ voiceId: decryptSocialToken(profile.providerVoiceIdCiphertext), script });
    const stored = await persistPrivateBuffer({ body: generated.audio, ownerUserId: job.requestedByUserId, kind: "voice-note", filename: `${job.id}.mp3`, mimeType: generated.mimeType });
    const [completed] = await db.update(relationshipVoiceGenerationJobs).set({
      status: "completed",
      providerRequestId: generated.providerRequestId ?? null,
      storageKey: stored.storageKey,
      mimeType: generated.mimeType,
      durationMs: generated.durationMs ?? null,
      sizeBytes: stored.sizeBytes,
      scriptCiphertext: encryptSocialToken("[discarded-after-generation]"),
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(relationshipVoiceGenerationJobs.id, job.id)).returning();
    const estimatedSeconds = Math.max(1, Math.ceil(script.trim().split(/\s+/).length / 2.5));
    await recordRelationshipUsage({
      businessId: job.businessId,
      metric: "voice.second",
      quantity: Math.max(1, Math.ceil((generated.durationMs ?? estimatedSeconds * 1_000) / 1_000)),
      provider: profile.provider,
      sourceType: "voice_generation_job",
      sourceId: job.id,
      idempotencyKey: `voice.second:${job.id}`,
    }).catch((error) => console.error("Could not meter relationship voice generation", { errorType: error instanceof Error ? error.name : typeof error }));
    return completed;
  } catch (error) {
    await db.update(relationshipVoiceGenerationJobs).set({ status: "failed", errorCode: error instanceof Error ? error.name : "voice_error", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Voice generation failed", updatedAt: new Date() }).where(eq(relationshipVoiceGenerationJobs.id, job.id));
    throw error;
  }
}

export async function relationshipVoiceReadUrl(input: { jobId: string; userId: number; businessId: string }) {
  const [job] = await db.select().from(relationshipVoiceGenerationJobs).where(and(eq(relationshipVoiceGenerationJobs.id, input.jobId), eq(relationshipVoiceGenerationJobs.businessId, input.businessId))).limit(1);
  if (!job?.storageKey || job.status !== "completed") throw new Error("Voice message is not available");
  if ((process.env.ASSET_STORAGE_PROVIDER ?? "local") === "local") return { url: `/${job.storageKey}`, expiresAt: null };
  return createPrivateAssetReadUrl(job.storageKey);
}
