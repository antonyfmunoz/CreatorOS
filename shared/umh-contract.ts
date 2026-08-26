import { z } from "zod";

export const UMH_PROTOCOL_VERSION = "umh.v1" as const;
export const UMH_COMMAND_SCHEMA_VERSION = "umh.command.v1" as const;
export const UMH_EVENT_SCHEMA_VERSION = "umh.event.v1" as const;
export const UMH_FEDERATION_CONTRACT_VERSION = "umh.federation.v1" as const;
export const UMH_CAPABILITY_MANIFEST_VERSION = "umh.capability-manifest.v1" as const;

export const supportedUmhCommandTypes = [
  "creativesos.content_draft.create.v1",
  "creativesos.campaign.create.v1",
  "creativesos.post.publish.v1",
  "creativesos.instrument.create.v1",
  "creativesos.instrument.revise.v1",
  "creativesos.instrument.lifecycle.v1",
  "creativesos.design.create.v1",
  "creativesos.design.revise.v1",
] as const;

export type SupportedUmhCommandType = typeof supportedUmhCommandTypes[number];

export const UmhCommandEnvelopeSchema = z.object({
  schemaVersion: z.literal(UMH_COMMAND_SCHEMA_VERSION),
  commandId: z.string().uuid(),
  commandType: z.enum(supportedUmhCommandTypes),
  idempotencyKey: z.string().min(1).max(256),
  correlationId: z.string().min(1).max(256).optional(),
  traceId: z.string().min(1).max(256),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  businessId: z.string().uuid(),
  delegatedUserId: z.number().int().positive(),
  payload: z.record(z.unknown()).default({}),
});

export type UmhCommandEnvelope = z.infer<typeof UmhCommandEnvelopeSchema>;

const CanonicalFederationPayloadSchema = z.object({
  schema_version: z.enum(supportedUmhCommandTypes),
}).catchall(z.unknown());

/**
 * The cross-product envelope is deliberately normalized at the boundary. The
 * domain layer continues to use the existing, tested command representation
 * until all projections have adopted the shared kernel.
 */
export const CanonicalFederationCommandEnvelopeSchema = z.object({
  contract_version: z.literal(UMH_FEDERATION_CONTRACT_VERSION),
  message_id: z.string().uuid(),
  message_kind: z.literal("command"),
  product_id: z.literal("creativesos"),
  installation_id: z.string().min(1).max(256),
  idempotency_key: z.string().min(1).max(256),
  correlation_id: z.string().min(1).max(256),
  trace_id: z.string().min(1).max(256),
  principal: z.object({
    subject: z.string().min(1).max(256),
    local_user_id: z.number().int().positive(),
  }),
  tenant: z.object({
    type: z.literal("business"),
    id: z.string().uuid(),
  }),
  workspace: z.object({
    type: z.string().min(1).max(64),
    id: z.string().min(1).max(256),
  }).nullable(),
  authority: z.object({
    basis: z.literal("business_manager"),
    delegation_id: z.string().min(1).max(256),
  }),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  consent: z.object({
    basis: z.literal("none_required"),
  }),
  payload: CanonicalFederationPayloadSchema,
});

export type CanonicalFederationCommandEnvelope = z.infer<typeof CanonicalFederationCommandEnvelopeSchema>;

export function normalizeCanonicalFederationCommand(
  envelope: CanonicalFederationCommandEnvelope,
  expectedInstallationId: string,
): UmhCommandEnvelope {
  if (envelope.installation_id !== expectedInstallationId) {
    throw new Error("UMH command installation does not match this CreativesOS projection");
  }

  const { schema_version, ...payload } = envelope.payload;
  return UmhCommandEnvelopeSchema.parse({
    schemaVersion: UMH_COMMAND_SCHEMA_VERSION,
    commandId: envelope.message_id,
    commandType: schema_version,
    idempotencyKey: envelope.idempotency_key,
    correlationId: envelope.correlation_id,
    traceId: envelope.trace_id,
    issuedAt: envelope.issued_at,
    expiresAt: envelope.expires_at,
    businessId: envelope.tenant.id,
    delegatedUserId: envelope.principal.local_user_id,
    payload,
  });
}

export function parseInboundUmhCommandEnvelope(
  value: unknown,
  expectedInstallationId?: string | null,
): { success: true; data: UmhCommandEnvelope; contract: "legacy" | "canonical" } | { success: false } {
  const canonical = CanonicalFederationCommandEnvelopeSchema.safeParse(value);
  if (canonical.success) {
    if (!expectedInstallationId) return { success: false };
    try {
      return { success: true, data: normalizeCanonicalFederationCommand(canonical.data, expectedInstallationId), contract: "canonical" };
    } catch {
      return { success: false };
    }
  }

  const legacy = UmhCommandEnvelopeSchema.safeParse(value);
  return legacy.success
    ? { success: true, data: legacy.data, contract: "legacy" }
    : { success: false };
}

export type UmhEventEnvelope = {
  schemaVersion: typeof UMH_EVENT_SCHEMA_VERSION;
  eventId: string;
  projection: "creativesos";
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  actorUserId: number | null;
  businessId: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId: string | null;
  traceId: string | null;
  occurredAt: string;
};

export function isApprovalRequired(commandType: SupportedUmhCommandType) {
  return commandType === "creativesos.post.publish.v1"
    || commandType === "creativesos.instrument.lifecycle.v1";
}

export function getCreativesOsCapabilityManifest(options: { installationId?: string | null } = {}) {
  return {
    manifestVersion: UMH_CAPABILITY_MANIFEST_VERSION,
    protocolVersion: UMH_PROTOCOL_VERSION,
    projection: "creativesos",
    displayName: "CreativesOS",
    mode: "standalone-with-optional-umh-federation",
    installation: { id: options.installationId ?? null, status: options.installationId ? "bound" : "unbound" },
    tenancy: { primary: "business", publicIdentity: "profile", workspace: "community" },
    federation: {
      proposedContractVersion: UMH_FEDERATION_CONTRACT_VERSION,
      qualificationStatus: "pending_shared_round_trip",
      transportSchemas: [UMH_COMMAND_SCHEMA_VERSION, UMH_EVENT_SCHEMA_VERSION],
      acceptedCommandContracts: [UMH_COMMAND_SCHEMA_VERSION, UMH_FEDERATION_CONTRACT_VERSION],
      canonicalCommandActivation: "requires_bound_installation",
      authority: "projection_local",
    },
    commands: supportedUmhCommandTypes.map((commandType) => ({
      commandType,
      approvalRequired: isApprovalRequired(commandType),
    })),
    emittedEvents: [
      "content_draft.created",
      "campaign.created",
      "campaign.status_changed",
      "campaign.metrics_logged",
      "distribution.scheduled",
      "event.created",
      "event.rsvp_changed",
      "community.room.scheduled",
      "community.room.live",
      "community.room.ended",
      "community.room.canceled",
      "community.room.recording.started",
      "community.room.recording.stop_requested",
      "community.room.transcription.started",
      "community.room.transcription.stopped",
      "community.room.realtime_ai.started",
      "community.room.realtime_ai.stopped",
      "cutstudio.project.created",
      "cutstudio.edl.updated",
      "cutstudio.transcript.ready",
      "cutstudio.render.ready",
      "cutstudio.asset.promoted",
      "broadcast.studio.created",
      "broadcast.studio.updated",
      "broadcast.stream.started",
      "broadcast.stream.ended",
      "broadcast.stream.failed",
      "broadcast.recording.started",
      "broadcast.recording.ready",
      "broadcast.recording.promoted",
      "post.published",
      "product.created",
    "product.updated",
      "order.paid",
      "instrument.created",
      "instrument.revised",
      "instrument.request_review",
      "instrument.approve",
      "instrument.request_changes",
      "instrument.publish",
      "instrument.archive",
      "instrument.restore",
      "database.record_created_from_form",
      "design.project.created",
      "design.project.revised",
      "design.project.resized",
      "design.review.started",
      "design.review.approved",
      "design.review.changes_requested",
    ],
    delivery: { transport: "signed_https", retry: "exponential_backoff", offline: "durable_outbox" },
    capabilities: [
      { id: "content.draft.create", kind: "projection", authority: "business_operator", approval: "none", consent: "none_required", provider: null, health: "healthy", proof: "durable_outcome_and_event" },
      { id: "campaign.create", kind: "projection", authority: "business_operator", approval: "none", consent: "none_required", provider: null, health: "healthy", proof: "durable_outcome_and_event" },
      { id: "post.publish", kind: "projection", authority: "author_or_business_policy", approval: "local_required", consent: "publication_policy", provider: null, health: "healthy", proof: "local_approval_and_event" },
      { id: "instrument.create", kind: "native", authority: "business_operator", approval: "none", consent: "none_required", provider: null, health: "healthy", proof: "typed_revision_and_durable_event" },
      { id: "instrument.revise", kind: "native", authority: "business_operator", approval: "none", consent: "none_required", provider: null, health: "healthy", proof: "optimistic_revision_and_durable_event" },
      { id: "instrument.lifecycle", kind: "native", authority: "business_admin", approval: "local_required", consent: "none_required", provider: null, health: "healthy", proof: "local_approval_state_transition_and_event" },
      { id: "design.create", kind: "native", authority: "business_operator", approval: "none", consent: "none_required", provider: null, health: "healthy", proof: "typed_canvas_initial_revision_and_durable_event" },
      { id: "design.revise", kind: "native", authority: "business_operator", approval: "none", consent: "none_required", provider: null, health: "healthy", proof: "optimistic_canvas_revision_and_durable_event" },
      { id: "cutstudio.edit", kind: "native", authority: "asset_owner", approval: "none", consent: "none_required", provider: "private_r2", health: "healthy", proof: "revisioned_edl_and_durable_event" },
      { id: "cutstudio.render", kind: "native", authority: "asset_owner", approval: "explicit_distribution_promotion", consent: "none_required", provider: "ffmpeg_private_r2", health: "healthy", proof: "durable_job_private_artifact_and_event" },
      { id: "broadcast.direct", kind: "native", authority: "business_operator", approval: "explicit_go_live", consent: "capture_notice_required_when_guests_are_present", provider: "browser_compositor_ffmpeg", health: "healthy", proof: "revisioned_scene_graph_durable_session_and_health" },
      { id: "broadcast.record", kind: "native", authority: "business_operator", approval: "explicit_record", consent: "recording_consent_required_when_guests_are_present", provider: "browser_compositor_private_r2", health: "healthy", proof: "private_recording_lineage_and_event" },
      { id: "broadcast.stream", kind: "provider", authority: "business_operator", approval: "explicit_go_live", consent: "platform_terms_and_capture_notice", provider: "rtmp_rtmps_srt_destination", health: "destination_required", proof: "encrypted_destination_durable_session_and_health" },
      { id: "community.room.schedule", kind: "native", authority: "community_manager", approval: "none", consent: "none_required", provider: "manual_link_or_configured_provider", health: "local_only", proof: "local_room_event" },
      { id: "community.room.recording", kind: "provider", authority: "room_host_and_participant_consent", approval: "consent_required", consent: "explicit_recording_consent", provider: "livekit_egress_to_private_r2", health: "healthy", proof: "production_verified_durable_recording_lineage_and_private_object" },
      { id: "community.room.transcription", kind: "provider", authority: "room_host_and_participant_consent", approval: "consent_required", consent: "explicit_transcription_consent", provider: "livekit_agent", health: "agent_runtime_required", proof: "signed_final_segment_ingress" },
      { id: "community.room.ai_participant", kind: "provider", authority: "room_host_and_participant_consent", approval: "consent_required", consent: "explicit_ai_analysis_consent", provider: "livekit_agent", health: "agent_runtime_required", proof: "role_profile_and_durable_dispatch_session" },
    ],
  };
}
