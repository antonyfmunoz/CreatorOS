import { describe, expect, it } from "vitest";
import { getReleaseReadiness } from "../server/release-readiness";

const liveEnvironment = {
  ASSET_STORAGE_PROVIDER: "r2",
  R2_PRIVATE_BUCKET_NAME: "creativesos-private",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLERK_SECRET_KEY: "sk_live_example",
  UMH_INSTALLATION_ID: "creativesos-pilot",
  UMH_COMMAND_SIGNING_SECRET: "inbound",
  UMH_EVENT_SIGNING_SECRET: "outbound",
  UMH_EVENT_INGEST_URL: "https://umh.example/events",
  LIVEKIT_URL: "wss://livekit.example",
  LIVEKIT_API_KEY: "livekit-key",
  LIVEKIT_API_SECRET: "livekit-secret",
  LIVEKIT_TRANSCRIPTION_AGENT_NAME: "creativesos-transcription",
  LIVEKIT_ROOM_AGENT_NAME: "creativesos-room-ai",
  ROOM_MEDIA_INGEST_SECRET: "a-secure-room-media-ingest-secret-value",
  OPENAI_API_KEY: "openai-key",
  ELEVENLABS_API_KEY: "elevenlabs-key",
  INSTAGRAM_APP_ID: "instagram-app",
  INSTAGRAM_APP_SECRET: "instagram-secret",
  META_GRAPH_API_VERSION: "v24.0",
  RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "webhook-token",
  SOCIAL_TOKEN_ENCRYPTION_KEY: "encryption-key",
};

describe("CreativesOS release readiness", () => {
  it("reports a production-ready local posture without revealing values", () => {
    expect(getReleaseReadiness(liveEnvironment)).toEqual({
      status: "release_ready",
      blockers: [],
      authentication: { configured: true, mode: "production" },
      assetDelivery: { private: "configured" },
      automations: { kernel: "configured", scheduler: "embedded", authority: "native" },
      relationshipHub: {
        kernel: "configured",
        nativeInbox: "configured",
        aiCopilot: "configured",
        clonedVoice: "configured",
        instagram: "configured",
      },
      federation: { installation: "bound", inboundCommands: true, outboundEvents: true, qualification: "pending_shared_round_trip" },
      communityRooms: {
        liveMedia: "configured",
        recording: "configured",
        transcription: "configured",
        transcriptIngest: "configured",
        realtimeAi: "configured",
      },
    });
  });

  it("calls out test authentication and missing private delivery as release gates", () => {
    const result = getReleaseReadiness({
      CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
      ASSET_STORAGE_PROVIDER: "r2",
    });
    expect(result.status).toBe("release_gated");
    expect(result.blockers).toEqual(["clerk_test_mode", "private_asset_delivery_unconfigured"]);
    expect(result.authentication.mode).toBe("test");
    expect(result.federation.qualification).toBe("not_configured");
    expect(result.relationshipHub).toEqual({
      kernel: "configured",
      nativeInbox: "configured",
      aiCopilot: "provider_pending",
      clonedVoice: "provider_pending",
      instagram: "provider_pending",
    });
    expect(result.communityRooms).toEqual({
      liveMedia: "unconfigured",
      recording: "unconfigured",
      transcription: "provider_pending",
      transcriptIngest: "provider_pending",
      realtimeAi: "provider_pending",
    });
  });

  it("keeps deferred room providers informational instead of release-blocking", () => {
    const result = getReleaseReadiness({
      ...liveEnvironment,
      LIVEKIT_TRANSCRIPTION_AGENT_NAME: undefined,
      LIVEKIT_ROOM_AGENT_NAME: undefined,
      ROOM_MEDIA_INGEST_SECRET: "too-short",
    });
    expect(result.status).toBe("release_ready");
    expect(result.blockers).toEqual([]);
    expect(result.communityRooms).toMatchObject({
      recording: "configured",
      transcription: "provider_pending",
      transcriptIngest: "provider_pending",
      realtimeAi: "provider_pending",
    });
  });
});
