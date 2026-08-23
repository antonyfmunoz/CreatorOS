import { z } from "zod";

export const providerActivationStages = [
  "connect",
  "credential_custody",
  "refresh_revoke",
  "inbound",
  "outbound",
  "webhook_signature",
  "idempotency",
  "rate_limit",
  "retry",
  "dead_letter",
  "receipt",
  "privacy_export",
  "deletion",
  "failure_recovery",
] as const;

export const providerActivationProviderIds = [
  "media_delivery",
  "email_delivery",
  "push_delivery",
  "podcast_directories",
  "youtube_distribution",
  "facebook_distribution",
  "instagram_distribution",
  "tiktok_distribution",
  "x_distribution",
  "instagram_inbox",
  "messenger_inbox",
  "whatsapp_inbox",
  "x_inbox",
  "remote_guests",
  "transcription",
  "realtime_ai",
  "relationship_ai",
  "cloned_voice",
  "broadcast_destinations",
  "stripe_platform_commerce",
  "stripe_creator_payouts",
  "umh_federation",
] as const;

export type ProviderActivationStage = (typeof providerActivationStages)[number];
export type ProviderActivationProviderId = (typeof providerActivationProviderIds)[number];
export type ProviderActivationEnvironment = "sandbox" | "staging" | "production";
export type ProviderActivationOutcome = "passed" | "failed" | "blocked";

export const providerActivationDefinitions: ReadonlyArray<{
  id: ProviderActivationProviderId;
  group: "media" | "audience" | "distribution" | "relationship" | "realtime" | "commerce" | "federation";
  label: string;
  description: string;
  requiredStages: readonly ProviderActivationStage[];
}> = [
  { id: "media_delivery", group: "media", label: "Media processing and delivery", description: "Adaptive VOD/live processing, private playback, CDN delivery, deletion, and migration recovery.", requiredStages: providerActivationStages },
  { id: "email_delivery", group: "audience", label: "Email delivery", description: "Transactional and bulk delivery, inbound replies, bounces, complaints, suppression, and reputation recovery.", requiredStages: providerActivationStages },
  { id: "push_delivery", group: "audience", label: "Web and native push", description: "Permission-governed browser and device delivery with token revocation and failure handling.", requiredStages: providerActivationStages },
  { id: "podcast_directories", group: "audience", label: "Podcast directories", description: "Feed ownership, destination submission, status reconciliation, revocation, and redirect evidence.", requiredStages: providerActivationStages },
  { id: "youtube_distribution", group: "distribution", label: "YouTube distribution", description: "OAuth publishing, channel reads, upload receipts, analytics reconciliation, and revocation.", requiredStages: providerActivationStages },
  { id: "facebook_distribution", group: "distribution", label: "Facebook distribution", description: "Approved Page publishing, media status, analytics, signed callbacks, throttling, and revocation.", requiredStages: providerActivationStages },
  { id: "instagram_distribution", group: "distribution", label: "Instagram distribution", description: "Approved account publishing, media status, analytics, rate limits, and recovery.", requiredStages: providerActivationStages },
  { id: "tiktok_distribution", group: "distribution", label: "TikTok distribution", description: "Approved publishing and analytics with durable receipts and policy-safe recovery.", requiredStages: providerActivationStages },
  { id: "x_distribution", group: "distribution", label: "X distribution", description: "OAuth publishing, receipts, analytics, token renewal, throttling, and revocation.", requiredStages: providerActivationStages },
  { id: "instagram_inbox", group: "relationship", label: "Instagram inbox", description: "Signed inbound events, public/private replies, receipts, identity continuity, and deletion.", requiredStages: providerActivationStages },
  { id: "messenger_inbox", group: "relationship", label: "Messenger inbox", description: "Page-authorized messaging, signed webhooks, delivery/read receipts, and recovery.", requiredStages: providerActivationStages },
  { id: "whatsapp_inbox", group: "relationship", label: "WhatsApp inbox", description: "Business messaging, service-window enforcement, media, receipts, and revocation.", requiredStages: providerActivationStages },
  { id: "x_inbox", group: "relationship", label: "X inbox", description: "DM normalization, outbound delivery, cursor reconciliation, receipts, and token renewal.", requiredStages: providerActivationStages },
  { id: "remote_guests", group: "realtime", label: "Remote guests", description: "Backstage/guest transport, role authority, reconnection, consent, and regional recovery.", requiredStages: providerActivationStages },
  { id: "transcription", group: "realtime", label: "Transcription and diarization", description: "Consent-governed realtime and post-session transcription, correction, deletion, and provider recovery.", requiredStages: providerActivationStages },
  { id: "realtime_ai", group: "realtime", label: "Realtime meeting AI", description: "Visible role-scoped AI participation, stop behavior, citations, rate limits, and recovery.", requiredStages: providerActivationStages },
  { id: "relationship_ai", group: "relationship", label: "Relationship AI", description: "Evidence-grounded suggestions, intervention, memory governance, deletion, and model-provider recovery.", requiredStages: providerActivationStages },
  { id: "cloned_voice", group: "relationship", label: "Cloned voice", description: "Verified-owner consent, script approval, provenance, generation, delivery receipts, and revocation.", requiredStages: providerActivationStages },
  { id: "broadcast_destinations", group: "realtime", label: "Broadcast destinations", description: "RTMP/RTMPS/SRT destination custody, health callbacks, failover, receipts, and deletion.", requiredStages: providerActivationStages },
  { id: "stripe_platform_commerce", group: "commerce", label: "Stripe platform commerce", description: "Customer payment, subscription, invoice, refund, dispute, webhook, entitlement, and failure-recovery evidence for platform sales.", requiredStages: providerActivationStages },
  { id: "stripe_creator_payouts", group: "commerce", label: "Stripe creator payouts", description: "Connected-account onboarding, allocation, payout, failure remediation, revocation, and privacy evidence.", requiredStages: providerActivationStages },
  { id: "umh_federation", group: "federation", label: "UMH federation", description: "Installation pairing, capability negotiation, signed commands/events, replay defense, revocation, and recovery.", requiredStages: providerActivationStages },
];

export const providerActivationProviderIdSchema = z.enum(providerActivationProviderIds);
export const providerActivationStageSchema = z.enum(providerActivationStages);
export const providerActivationEnvironmentSchema = z.enum(["sandbox", "staging", "production"]);
export const providerActivationOutcomeSchema = z.enum(["passed", "failed", "blocked"]);

const secretLike = /(?:\b(?:sk|pk)_(?:live|test)_[a-z0-9_-]{12,}|\bwhsec_[a-z0-9_-]{12,}|\bAKIA[A-Z0-9]{16}\b|\bAIza[A-Za-z0-9_-]{20,}|(?:client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]|\bbearer\s+[a-z0-9._~+\/-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;

const safeEvidenceUrlSchema = z.string().url().max(1_000).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !secretLike.test(decodeURIComponent(url.pathname));
  } catch {
    return false;
  }
}, "Evidence URL must be HTTPS and must not contain credentials, query parameters, or fragments");

export const providerActivationRunInputSchema = z.object({
  environment: providerActivationEnvironmentSchema,
  summary: z.string().trim().max(500).refine((value) => !secretLike.test(value), "Summary appears to contain a credential").default(""),
});

export const providerActivationEvidenceInputSchema = z.object({
  stage: providerActivationStageSchema,
  outcome: providerActivationOutcomeSchema,
  evidenceUrl: safeEvidenceUrlSchema.optional(),
  summary: z.string().trim().min(10).max(500).refine((value) => !secretLike.test(value), "Summary appears to contain a credential"),
  observedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
}).superRefine((value, context) => {
  if (value.observedAt && value.observedAt > new Date(Date.now() + 5 * 60_000)) {
    context.addIssue({ code: "custom", path: ["observedAt"], message: "Evidence observation cannot be in the future" });
  }
  if (value.outcome === "passed" && !value.evidenceUrl) {
    context.addIssue({ code: "custom", path: ["evidenceUrl"], message: "Passed evidence requires a durable HTTPS reference" });
  }
  if (value.expiresAt && value.observedAt && value.expiresAt <= value.observedAt) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Evidence expiry must be after observation" });
  }
});

export type ProviderActivationEvidenceLike = {
  stage: string;
  outcome: string;
  observedAt: Date | string;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
};

export function summarizeProviderActivationRun(
  providerId: ProviderActivationProviderId,
  evidence: ProviderActivationEvidenceLike[],
  now = new Date(),
) {
  const definition = providerActivationDefinitions.find((candidate) => candidate.id === providerId);
  if (!definition) throw new Error(`Unknown provider activation: ${providerId}`);
  const latest = new Map<ProviderActivationStage, ProviderActivationEvidenceLike>();
  for (const item of [...evidence].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())) {
    if (providerActivationStages.includes(item.stage as ProviderActivationStage)) latest.set(item.stage as ProviderActivationStage, item);
  }
  const passed: ProviderActivationStage[] = [];
  const failed: ProviderActivationStage[] = [];
  const blocked: ProviderActivationStage[] = [];
  const expired: ProviderActivationStage[] = [];
  const missing: ProviderActivationStage[] = [];
  for (const stage of definition.requiredStages) {
    const item = latest.get(stage);
    if (!item) { missing.push(stage); continue; }
    if (item.expiresAt && new Date(item.expiresAt) <= now) { expired.push(stage); continue; }
    if (item.outcome === "passed") passed.push(stage);
    else if (item.outcome === "failed") failed.push(stage);
    else blocked.push(stage);
  }
  const state = failed.length
    ? "failed"
    : blocked.length
      ? "blocked"
      : passed.length === definition.requiredStages.length
        ? "qualified"
        : evidence.length
          ? "in_progress"
          : "not_started";
  return {
    state,
    progressBps: Math.round((passed.length / definition.requiredStages.length) * 10_000),
    qualifiable: state === "qualified",
    passed,
    failed,
    blocked,
    expired,
    missing: [...missing, ...expired.filter((stage) => !missing.includes(stage))],
  } as const;
}
