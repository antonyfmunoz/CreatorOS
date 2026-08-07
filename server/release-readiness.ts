import { configuredRoomMediaIngestSecret } from "./room-media";

type RuntimeEnvironment = Record<string, string | undefined>;

function isLiveKey(value: string | undefined, testPrefix: string) {
  return Boolean(value && !value.startsWith(testPrefix));
}

/**
 * Public-safe release posture: it reports only whether a dependency category
 * is ready. It never returns a credential, endpoint, account identifier, or
 * other operational secret.
 */
export function getReleaseReadiness(environment: RuntimeEnvironment = process.env) {
  const clerkConfigured = Boolean(environment.CLERK_PUBLISHABLE_KEY && environment.CLERK_SECRET_KEY);
  const clerkProduction = isLiveKey(environment.CLERK_PUBLISHABLE_KEY, "pk_test_")
    && isLiveKey(environment.CLERK_SECRET_KEY, "sk_test_");
  const privateAssetDelivery = Boolean(
    environment.ASSET_STORAGE_PROVIDER === "r2"
    && environment.R2_PRIVATE_BUCKET_NAME
    && environment.R2_ACCOUNT_ID
    && environment.R2_ACCESS_KEY_ID
    && environment.R2_SECRET_ACCESS_KEY,
  );
  const umhBound = Boolean(environment.UMH_INSTALLATION_ID);
  const umhInbound = Boolean(environment.UMH_COMMAND_SIGNING_SECRET);
  const umhOutbound = Boolean(environment.UMH_EVENT_SIGNING_SECRET && environment.UMH_EVENT_INGEST_URL);
  const liveMedia = Boolean(
    environment.LIVEKIT_URL
    && environment.LIVEKIT_API_KEY
    && environment.LIVEKIT_API_SECRET,
  );
  const recording = liveMedia && privateAssetDelivery;
  const transcriptIngest = Boolean(
    configuredRoomMediaIngestSecret(environment.ROOM_MEDIA_INGEST_SECRET),
  );
  const transcription = Boolean(
    liveMedia
    && environment.LIVEKIT_TRANSCRIPTION_AGENT_NAME
    && transcriptIngest,
  );
  const realtimeAi = Boolean(liveMedia && environment.LIVEKIT_ROOM_AGENT_NAME);

  const blockers: string[] = [];
  if (!clerkProduction) blockers.push(clerkConfigured ? "clerk_test_mode" : "clerk_unconfigured");
  if (!privateAssetDelivery) blockers.push("private_asset_delivery_unconfigured");

  return {
    status: blockers.length === 0 ? "release_ready" : "release_gated",
    blockers,
    authentication: { configured: clerkConfigured, mode: clerkProduction ? "production" : clerkConfigured ? "test" : "unconfigured" },
    assetDelivery: { private: privateAssetDelivery ? "configured" : "unconfigured" },
    automations: {
      kernel: "configured",
      scheduler: "embedded",
      authority: "native",
    },
    federation: {
      installation: umhBound ? "bound" : "unbound",
      inboundCommands: umhInbound,
      outboundEvents: umhOutbound,
      qualification: umhBound && umhInbound && umhOutbound ? "pending_shared_round_trip" : "not_configured",
    },
    communityRooms: {
      liveMedia: liveMedia ? "configured" : "unconfigured",
      recording: recording ? "configured" : "unconfigured",
      transcription: transcription ? "configured" : "provider_pending",
      transcriptIngest: transcriptIngest ? "configured" : "provider_pending",
      realtimeAi: realtimeAi ? "configured" : "provider_pending",
    },
  };
}
