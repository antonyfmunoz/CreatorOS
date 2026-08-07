import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getCreativesOsCapabilityManifest,
  isApprovalRequired,
  normalizeCanonicalFederationCommand,
  parseInboundUmhCommandEnvelope,
  UmhCommandEnvelopeSchema,
} from "../shared/umh-contract";
import { createUmhSignature, verifyUmhSignature } from "../server/umh-signing";

const validDraftCommand = {
  schemaVersion: "umh.command.v1",
  commandId: "b9d08d61-7d70-4ffd-96b7-505ce78c0039",
  commandType: "creativesos.content_draft.create.v1",
  idempotencyKey: "umh-test-draft-1",
  traceId: "trace-test-1",
  issuedAt: "2026-08-03T00:00:00.000Z",
  expiresAt: "2026-08-03T00:05:00.000Z",
  businessId: "48dccde9-69f7-4b40-bb4b-817d21987f91",
  delegatedUserId: 1,
  payload: { content: "A local draft, not an external publication." },
};

const canonicalDraftCommand = {
  contract_version: "umh.federation.v1",
  message_id: "b9d08d61-7d70-4ffd-96b7-505ce78c0039",
  message_kind: "command",
  product_id: "creativesos",
  installation_id: "creativesos-private-pilot",
  idempotency_key: "umh-test-draft-1",
  correlation_id: "content-draft-pilot-1",
  trace_id: "trace-test-1",
  principal: { subject: "umh-user-1", local_user_id: 1 },
  tenant: { type: "business", id: "48dccde9-69f7-4b40-bb4b-817d21987f91" },
  workspace: null,
  authority: { basis: "business_manager", delegation_id: "delegation-test-1" },
  issued_at: "2026-08-03T00:00:00.000Z",
  expires_at: "2026-08-03T00:05:00.000Z",
  consent: { basis: "none_required" },
  payload: { schema_version: "creativesos.content_draft.create.v1", content: "A local draft, not an external publication." },
};

describe("CreativesOS UMH federation contract", () => {
  it("accepts a fully scoped low-risk command envelope", () => {
    expect(UmhCommandEnvelopeSchema.safeParse(validDraftCommand).success).toBe(true);
  });

  it("rejects an unscoped or unknown command before it reaches domain logic", () => {
    expect(UmhCommandEnvelopeSchema.safeParse({ ...validDraftCommand, businessId: "not-a-uuid" }).success).toBe(false);
    expect(UmhCommandEnvelopeSchema.safeParse({ ...validDraftCommand, commandType: "creativesos.money.send.v1" }).success).toBe(false);
  });

  it("normalizes a fully scoped canonical command without expanding the command surface", () => {
    const parsed = parseInboundUmhCommandEnvelope(canonicalDraftCommand, "creativesos-private-pilot");
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.contract).toBe("canonical");
    expect(parsed.data).toMatchObject({
      commandId: canonicalDraftCommand.message_id,
      commandType: "creativesos.content_draft.create.v1",
      correlationId: canonicalDraftCommand.correlation_id,
      businessId: canonicalDraftCommand.tenant.id,
      delegatedUserId: canonicalDraftCommand.principal.local_user_id,
      payload: { content: canonicalDraftCommand.payload.content },
    });
  });

  it("fails closed when a canonical command is unbound or targets another installation", () => {
    expect(parseInboundUmhCommandEnvelope(canonicalDraftCommand, null).success).toBe(false);
    expect(parseInboundUmhCommandEnvelope(canonicalDraftCommand, "other-installation").success).toBe(false);
    expect(parseInboundUmhCommandEnvelope({ ...canonicalDraftCommand, tenant: { type: "profile", id: canonicalDraftCommand.tenant.id } }, "creativesos-private-pilot").success).toBe(false);
  });

  it("requires local approval only for the externally visible command", () => {
    expect(isApprovalRequired("creativesos.content_draft.create.v1")).toBe(false);
    expect(isApprovalRequired("creativesos.campaign.create.v1")).toBe(false);
    expect(isApprovalRequired("creativesos.post.publish.v1")).toBe(true);
  });

  it("advertises only the current real command surface", () => {
    const manifest = getCreativesOsCapabilityManifest();
    expect(manifest.projection).toBe("creativesos");
    expect(manifest.manifestVersion).toBe("umh.capability-manifest.v1");
    expect(manifest.federation.qualificationStatus).toBe("pending_shared_round_trip");
    expect(manifest.federation.canonicalCommandActivation).toBe("requires_bound_installation");
    expect(manifest.capabilities.find((capability) => capability.id === "community.room.recording")?.health).toBe("healthy");
    expect(manifest.capabilities.find((capability) => capability.id === "community.room.transcription")?.proof).toBe("signed_final_segment_ingress");
    expect(manifest.capabilities.find((capability) => capability.id === "community.room.ai_participant")?.health).toBe("agent_runtime_required");
    expect(manifest.commands.map((command) => command.commandType)).toEqual([
      "creativesos.content_draft.create.v1",
      "creativesos.campaign.create.v1",
      "creativesos.post.publish.v1",
    ]);
    expect(manifest.delivery.offline).toBe("durable_outbox");
    expect(manifest.emittedEvents).toEqual(expect.arrayContaining([
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
    ]));
  });

  it("keeps the shared round-trip fixture limited to a private, low-risk draft", () => {
    const fixturePath = resolve(process.cwd(), "tests/fixtures/umh-federation-v1/creativesos-content-draft-command.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
    expect(fixture.contract_version).toBe("umh.federation.v1");
    expect(fixture.message_kind).toBe("command");
    expect(fixture.product_id).toBe("creativesos");
    expect(fixture.idempotency_key).toBe("qualification:creativesos:draft:001");
    expect((fixture.payload as Record<string, unknown>).audience).toBe("private");
  });

  it("uses a tamper-evident signature for the exact request body", () => {
    const body = JSON.stringify(validDraftCommand);
    const signature = createUmhSignature("integration-test-secret", "2026-08-03T00:00:00.000Z", "nonce-1", body);
    expect(verifyUmhSignature("integration-test-secret", "2026-08-03T00:00:00.000Z", "nonce-1", body, signature)).toBe(true);
    expect(verifyUmhSignature("integration-test-secret", "2026-08-03T00:00:00.000Z", "nonce-1", `${body}changed`, signature)).toBe(false);
    expect(verifyUmhSignature("integration-test-secret", "2026-08-03T00:00:00.000Z", "nonce-2", body, signature)).toBe(false);
  });
});
