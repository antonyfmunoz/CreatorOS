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
export function getReleaseReadiness(
  environment: RuntimeEnvironment = process.env,
) {
  const clerkConfigured = Boolean(
    environment.CLERK_PUBLISHABLE_KEY && environment.CLERK_SECRET_KEY,
  );
  const clerkProduction =
    isLiveKey(environment.CLERK_PUBLISHABLE_KEY, "pk_test_") &&
    isLiveKey(environment.CLERK_SECRET_KEY, "sk_test_");
  const privateAssetDelivery = Boolean(
    environment.ASSET_STORAGE_PROVIDER === "r2" &&
    environment.R2_PRIVATE_BUCKET_NAME &&
    environment.R2_ACCOUNT_ID &&
    environment.R2_ACCESS_KEY_ID &&
    environment.R2_SECRET_ACCESS_KEY,
  );
  const umhBound = Boolean(environment.UMH_INSTALLATION_ID);
  const umhInbound = Boolean(environment.UMH_COMMAND_SIGNING_SECRET);
  const umhOutbound = Boolean(
    environment.UMH_EVENT_SIGNING_SECRET && environment.UMH_EVENT_INGEST_URL,
  );
  const liveMedia = Boolean(
    environment.LIVEKIT_URL &&
    environment.LIVEKIT_API_KEY &&
    environment.LIVEKIT_API_SECRET,
  );
  const recording = liveMedia && privateAssetDelivery;
  const transcriptIngest = Boolean(
    configuredRoomMediaIngestSecret(environment.ROOM_MEDIA_INGEST_SECRET),
  );
  const transcription = Boolean(
    liveMedia &&
    environment.LIVEKIT_TRANSCRIPTION_AGENT_NAME &&
    transcriptIngest,
  );
  const realtimeAi = Boolean(liveMedia && environment.LIVEKIT_ROOM_AGENT_NAME);
  const relationshipAi = Boolean(environment.OPENAI_API_KEY);
  const relationshipVoice = Boolean(
    environment.ELEVENLABS_API_KEY && privateAssetDelivery,
  );
  const relationshipInstagram = Boolean(
    environment.INSTAGRAM_APP_ID &&
    environment.INSTAGRAM_APP_SECRET &&
    environment.META_GRAPH_API_VERSION &&
    (environment.RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
      environment.META_WEBHOOK_VERIFY_TOKEN) &&
    environment.SOCIAL_TOKEN_ENCRYPTION_KEY,
  );
  const relationshipX = Boolean(
    environment.X_CLIENT_ID &&
    environment.X_CLIENT_SECRET &&
    environment.X_API_SECRET &&
    environment.SOCIAL_TOKEN_ENCRYPTION_KEY,
  );
  const relationshipMetaBase = Boolean(
    (environment.META_APP_SECRET || environment.INSTAGRAM_APP_SECRET) &&
    environment.META_GRAPH_API_VERSION &&
    (environment.RELATIONSHIP_META_WEBHOOK_VERIFY_TOKEN ||
      environment.META_WEBHOOK_VERIFY_TOKEN ||
      environment.RELATIONSHIP_INSTAGRAM_WEBHOOK_VERIFY_TOKEN) &&
    environment.SOCIAL_TOKEN_ENCRYPTION_KEY,
  );
  const relationshipMessenger = Boolean(
    relationshipMetaBase &&
    (environment.META_APP_ID || environment.INSTAGRAM_APP_ID),
  );
  const broadcastDestinationSecurity = Boolean(
    environment.SOCIAL_TOKEN_ENCRYPTION_KEY,
  );

  const blockers: string[] = [];
  if (!clerkProduction)
    blockers.push(clerkConfigured ? "clerk_test_mode" : "clerk_unconfigured");
  if (!privateAssetDelivery)
    blockers.push("private_asset_delivery_unconfigured");

  return {
    status: blockers.length === 0 ? "release_ready" : "release_gated",
    blockers,
    authentication: {
      configured: clerkConfigured,
      mode: clerkProduction
        ? "production"
        : clerkConfigured
          ? "test"
          : "unconfigured",
    },
    assetDelivery: {
      private: privateAssetDelivery ? "configured" : "unconfigured",
    },
    automations: {
      kernel: "configured",
      scheduler: "embedded",
      authority: "native",
    },
    connectedCreationLoop: {
      broadcastToEdit: "configured",
      captionedRender: "configured",
      distributionHandoff: "configured",
      nativeRelationshipAutomation: "configured",
      performanceFeedback: "configured",
    },
    relationshipHub: {
      kernel: "configured",
      nativeInbox: "configured",
      usageControls: "configured",
      operationsTelemetry: "configured",
      realtimeRelationshipContext: realtimeAi
        ? "configured"
        : "provider_pending",
      aiCopilot: relationshipAi ? "configured" : "provider_pending",
      clonedVoice: relationshipVoice ? "configured" : "provider_pending",
      instagram: relationshipInstagram ? "configured" : "provider_pending",
      messenger: relationshipMessenger ? "configured" : "provider_pending",
      whatsapp: relationshipMetaBase ? "configured" : "provider_pending",
      x: relationshipX ? "configured" : "provider_pending",
    },
    federation: {
      installation: umhBound ? "bound" : "unbound",
      inboundCommands: umhInbound,
      outboundEvents: umhOutbound,
      qualification:
        umhBound && umhInbound && umhOutbound
          ? "pending_shared_round_trip"
          : "not_configured",
    },
    communityRooms: {
      liveMedia: liveMedia ? "configured" : "unconfigured",
      recording: recording ? "configured" : "unconfigured",
      transcription: transcription ? "configured" : "provider_pending",
      transcriptIngest: transcriptIngest ? "configured" : "provider_pending",
      realtimeAi: realtimeAi ? "configured" : "provider_pending",
    },
    cutStudio: {
      privateIngest: privateAssetDelivery ? "configured" : "unconfigured",
      nonDestructiveEdl: "configured",
      timelineMarkers: "configured",
      boundarySnapping: "configured",
      synchronizedClipGroups: "configured",
      directTimelineDrag: "configured",
      precisionTrimHandles: "configured",
      trackRippleEditing: "configured",
      linkedRippleEditing: "configured",
      rollingTrimEditing: "configured",
      slipSourceEditing: "configured",
      durableCompoundTimelines: "configured",
      trackAuthorityControls: "configured",
      renderEffectiveTrackMixing: "configured",
      mediaDerivedWaveforms: "configured",
      realtimeAudioMeter: "configured",
      projectMediaLibrary: "configured",
      multitrackRender: "configured",
      reviewCollaboration: "configured",
      sideBySideVersionComparison: "configured",
      workspaceCollaborators: "configured",
      mentionNotifications: "configured",
      nativeTitles: "configured",
      transitionPresets: "configured",
      crossDissolve: "configured",
      transcriptCorrection: "configured",
      transcriptStoryReordering: "configured",
      transcriptSpeakerLabels: "configured",
      captionSidecars: "configured",
      kineticCaptions: "configured",
      privateLutImport: "configured",
      calibratedLoudnessAnalysis: "configured",
      renderEffectivePositionKeyframes: "configured",
      renderEffectiveScaleOpacityKeyframes: "configured",
      motionEasingPresets: "configured",
      namedAudioBuses: "configured",
      organizationAudioRoutingTemplates: "configured",
      sourceRecordMonitors: "configured",
      continuousLoudnessMeter: "configured",
      renderEffectiveVolumeAutomation: "configured",
      renderProfiles: "configured",
      failedJobRetry: "configured",
      runningJobCancellation: "configured",
      audioMasteringPresets: "configured",
      automaticAudioDucking: "configured",
      colorGradePresets: "configured",
      customColorCorrection: "configured",
      chromaKey: "configured",
    },
    broadcastStudio: {
      sceneComposer: "configured",
      privateLutWorkflow: "configured",
      sceneTemplates: "configured",
      reusableScenePresets: "configured",
      reusableSourcePresets: "configured",
      renderEffectiveAudioProcessing: "configured",
      localAudioMonitoring: "configured",
      deviceAudioCleanup: "configured",
      programMonitorRouting: "configured",
      namedAuxMixBuses: "configured",
      audioSyncAndBalance: "configured",
      chromaKey: "configured",
      animatedOverlays: "configured",
      expandedOverlayMotion: "configured",
      brandKit: "configured",
      accountBrandLibrary: "configured",
      organizationTemplateCatalog: "configured",
      organizationMediaLibrary: "configured",
      configurationVersionHistory: "configured",
      multiStudioManagement: "configured",
      teamStudioCollaboration: "configured",
      broadcastToCutStudio: "configured",
      multiAspect: "configured",
      multiDestination: "configured",
      destinationReceipts: "configured",
      destinationFailureIsolation: "configured",
      automaticReconnect: "configured",
      productionMarkers: "configured",
      nativeAudienceControl: "configured",
      recordingPauseResume: "configured",
      isolatedSourceTracks: privateAssetDelivery ? "configured" : "unconfigured",
      localQualityCapture: privateAssetDelivery ? "configured" : "unconfigured",
      nativeGraphics: "configured",
      browserCapture: "configured",
      serverEncoder: "configured",
      privateRecording: privateAssetDelivery ? "configured" : "unconfigured",
      destinationSecurity: broadcastDestinationSecurity
        ? "configured"
        : "unconfigured",
      liveDestination: "provider_pending",
    },
  };
}
