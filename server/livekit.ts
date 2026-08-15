import {
  AccessToken,
  AgentDispatchClient,
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  TrackType,
  type EgressInfo,
  type ParticipantInfo,
} from "livekit-server-sdk";

export type LiveKitConfiguration = {
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type LiveKitRecordingConfiguration = LiveKitConfiguration & {
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2PrivateBucketName: string;
};

type LiveKitEnvironment = Partial<
  Record<
    | "LIVEKIT_URL"
    | "LIVEKIT_API_KEY"
    | "LIVEKIT_API_SECRET"
    | "LIVEKIT_TRANSCRIPTION_AGENT_NAME"
    | "LIVEKIT_ROOM_AGENT_NAME"
    | "R2_ACCOUNT_ID"
    | "R2_ACCESS_KEY_ID"
    | "R2_SECRET_ACCESS_KEY"
    | "R2_PRIVATE_BUCKET_NAME",
    string
  >
>;

function processLiveKitEnvironment(): LiveKitEnvironment {
  return {
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    LIVEKIT_TRANSCRIPTION_AGENT_NAME:
      process.env.LIVEKIT_TRANSCRIPTION_AGENT_NAME,
    LIVEKIT_ROOM_AGENT_NAME: process.env.LIVEKIT_ROOM_AGENT_NAME,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_PRIVATE_BUCKET_NAME: process.env.R2_PRIVATE_BUCKET_NAME,
  };
}

export type LiveKitParticipantInput = {
  roomId: string;
  communityId: number;
  userId: number;
  displayName: string;
  role: string;
  canPublish: boolean;
};

export function liveKitRoomName(communityId: number, roomId: string) {
  return `creativesos-community-${communityId}-room-${roomId}`;
}

export function broadcastLiveKitRoomName(studioId: string) {
  return `creativesos-broadcast-${studioId}`;
}

export function getLiveKitConfiguration(
  environment: LiveKitEnvironment = processLiveKitEnvironment(),
): LiveKitConfiguration | null {
  const serverUrl = environment.LIVEKIT_URL?.trim();
  const apiKey = environment.LIVEKIT_API_KEY?.trim();
  const apiSecret = environment.LIVEKIT_API_SECRET?.trim();
  if (!serverUrl || !apiKey || !apiSecret) return null;

  try {
    const url = new URL(serverUrl);
    if (!["wss:", "ws:"].includes(url.protocol)) return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "wss:")
      return null;
  } catch {
    return null;
  }

  return { serverUrl, apiKey, apiSecret };
}

export function liveKitProviderStatus(
  environment: LiveKitEnvironment = processLiveKitEnvironment(),
) {
  const configured = getLiveKitConfiguration(environment) !== null;
  return {
    configured,
    recordingConfigured:
      getLiveKitRecordingConfiguration(environment) !== null,
    transcriptionAgentConfigured:
      configured && Boolean(environment.LIVEKIT_TRANSCRIPTION_AGENT_NAME?.trim()),
    roomAgentConfigured:
      configured && Boolean(environment.LIVEKIT_ROOM_AGENT_NAME?.trim()),
  };
}

export function liveKitApiUrl(serverUrl: string) {
  const url = new URL(serverUrl);
  if (url.protocol === "wss:") url.protocol = "https:";
  else if (url.protocol === "ws:") url.protocol = "http:";
  return url.toString().replace(/\/$/, "");
}

export function getLiveKitRecordingConfiguration(
  environment: LiveKitEnvironment = processLiveKitEnvironment(),
): LiveKitRecordingConfiguration | null {
  const liveKit = getLiveKitConfiguration(environment);
  const r2AccountId = environment.R2_ACCOUNT_ID?.trim();
  const r2AccessKeyId = environment.R2_ACCESS_KEY_ID?.trim();
  const r2SecretAccessKey = environment.R2_SECRET_ACCESS_KEY?.trim();
  const r2PrivateBucketName = environment.R2_PRIVATE_BUCKET_NAME?.trim();
  if (
    !liveKit ||
    !r2AccountId ||
    !r2AccessKeyId ||
    !r2SecretAccessKey ||
    !r2PrivateBucketName
  )
    return null;
  return {
    ...liveKit,
    r2AccountId,
    r2AccessKeyId,
    r2SecretAccessKey,
    r2PrivateBucketName,
  };
}

function egressClient(configuration: LiveKitConfiguration) {
  return new EgressClient(
    liveKitApiUrl(configuration.serverUrl),
    configuration.apiKey,
    configuration.apiSecret,
  );
}

export function liveKitRecordingStorageKey(roomId: string, recordingId: string) {
  return `creativesos/${process.env.NODE_ENV ?? "development"}/private/community-rooms/${roomId}/recordings/${recordingId}.mp4`;
}

export async function startLiveKitRoomRecording(
  configuration: LiveKitRecordingConfiguration,
  input: { roomName: string; storageKey: string },
) {
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: input.storageKey,
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: configuration.r2AccessKeyId,
        secret: configuration.r2SecretAccessKey,
        endpoint: `https://${configuration.r2AccountId}.r2.cloudflarestorage.com`,
        bucket: configuration.r2PrivateBucketName,
        forcePathStyle: true,
        metadata: { source: "creativesos-community-room" },
        contentDisposition: "attachment",
      }),
    },
  });
  return egressClient(configuration).startRoomCompositeEgress(
    input.roomName,
    { file: output },
    { layout: "grid", audioOnly: false, videoOnly: false },
  );
}

export function stopLiveKitRoomRecording(
  configuration: LiveKitConfiguration,
  providerRecordingId: string,
) {
  return egressClient(configuration).stopEgress(providerRecordingId);
}

export async function getLiveKitRoomRecording(
  configuration: LiveKitConfiguration,
  providerRecordingId: string,
) {
  const [recording] = await egressClient(configuration).listEgress({
    egressId: providerRecordingId,
  });
  return recording ?? null;
}

export function liveKitRecordingResult(info: EgressInfo) {
  const result =
    info.fileResults[0] ??
    (info.result.case === "file" ? info.result.value : undefined);
  const statuses: Record<number, string> = {
    [EgressStatus.EGRESS_STARTING]: "starting",
    [EgressStatus.EGRESS_ACTIVE]: "active",
    [EgressStatus.EGRESS_ENDING]: "stopping",
    [EgressStatus.EGRESS_COMPLETE]: "complete",
    [EgressStatus.EGRESS_FAILED]: "failed",
    [EgressStatus.EGRESS_ABORTED]: "aborted",
    [EgressStatus.EGRESS_LIMIT_REACHED]: "failed",
  };
  const status = statuses[info.status] ?? "failed";
  return {
    providerRecordingId: info.egressId,
    status,
    startedAt:
      info.startedAt > BigInt(0)
        ? new Date(Number(info.startedAt / BigInt(1_000_000)))
        : null,
    stoppedAt:
      info.endedAt > BigInt(0)
        ? new Date(Number(info.endedAt / BigInt(1_000_000)))
        : null,
    durationMs: result
      ? Number(result.duration / BigInt(1_000_000))
      : null,
    sizeBytes: result ? Number(result.size) : null,
    errorMessage:
      info.error || (["failed", "aborted"].includes(status) ? info.details : null) || null,
  };
}

export function hasLiveKitPublishedMediaTrack(
  participants: Pick<ParticipantInfo, "tracks">[],
) {
  return participants.some((participant) =>
    participant.tracks.some(
      (track) =>
        !track.muted &&
        (track.type === TrackType.AUDIO || track.type === TrackType.VIDEO),
    ),
  );
}

export async function getLiveKitRoomParticipantState(
  configuration: LiveKitConfiguration,
  roomName: string,
) {
  const participants = await new RoomServiceClient(
    liveKitApiUrl(configuration.serverUrl),
    configuration.apiKey,
    configuration.apiSecret,
  ).listParticipants(roomName);
  return {
    userIds: participants
      .map((participant) => liveKitUserIdFromIdentity(participant.identity))
      .filter((userId): userId is number => userId !== null),
    hasPublishedMedia: hasLiveKitPublishedMediaTrack(participants),
  };
}

export async function listLiveKitRoomParticipantUserIds(
  configuration: LiveKitConfiguration,
  roomName: string,
) {
  return (await getLiveKitRoomParticipantState(configuration, roomName)).userIds;
}

export function liveKitUserIdFromIdentity(identity: string) {
  const match = /^creativesos-user-(\d+)$/.exec(identity);
  if (!match) return null;
  const userId = Number(match[1]);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function removeLiveKitRoomParticipant(
  configuration: LiveKitConfiguration,
  input: { roomName: string; userId: number },
) {
  return new RoomServiceClient(
    liveKitApiUrl(configuration.serverUrl),
    configuration.apiKey,
    configuration.apiSecret,
  ).removeParticipant(input.roomName, `creativesos-user-${input.userId}`);
}

export function getLiveKitAgentName(
  kind: "transcription" | "realtime_ai",
  environment: LiveKitEnvironment = processLiveKitEnvironment(),
) {
  return (
    kind === "transcription"
      ? environment.LIVEKIT_TRANSCRIPTION_AGENT_NAME
      : environment.LIVEKIT_ROOM_AGENT_NAME
  )?.trim() || null;
}

export async function dispatchLiveKitRoomAgent(
  configuration: LiveKitConfiguration,
  input: { roomName: string; agentName: string; metadata: Record<string, unknown> },
) {
  return new AgentDispatchClient(
    liveKitApiUrl(configuration.serverUrl),
    configuration.apiKey,
    configuration.apiSecret,
  ).createDispatch(input.roomName, input.agentName, {
    metadata: JSON.stringify(input.metadata),
  });
}

export function stopLiveKitRoomAgent(
  configuration: LiveKitConfiguration,
  input: { roomName: string; providerSessionId: string },
) {
  return new AgentDispatchClient(
    liveKitApiUrl(configuration.serverUrl),
    configuration.apiKey,
    configuration.apiSecret,
  ).deleteDispatch(input.providerSessionId, input.roomName);
}

export async function createLiveKitParticipantToken(
  configuration: LiveKitConfiguration,
  participant: LiveKitParticipantInput,
) {
  const roomName = liveKitRoomName(participant.communityId, participant.roomId);
  const identity = `creativesos-user-${participant.userId}`;
  const token = new AccessToken(configuration.apiKey, configuration.apiSecret, {
    identity,
    name: participant.displayName,
    ttl: "15m",
    metadata: JSON.stringify({
      userId: participant.userId,
      communityId: participant.communityId,
      roomId: participant.roomId,
      role: participant.role,
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: participant.canPublish,
    canSubscribe: true,
    canPublishData: participant.canPublish,
  });

  return {
    token: await token.toJwt(),
    serverUrl: configuration.serverUrl,
    roomName,
    participant: { identity, name: participant.displayName },
  };
}

export async function createBroadcastLiveKitToken(
  configuration: LiveKitConfiguration,
  input: {
    studioId: string;
    identity: string;
    name: string;
    role: "field_camera" | "operator";
    canPublish: boolean;
    canSubscribe: boolean;
  },
) {
  const roomName = broadcastLiveKitRoomName(input.studioId);
  const token = new AccessToken(configuration.apiKey, configuration.apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: "10m",
    metadata: JSON.stringify({ studioId: input.studioId, role: input.role }),
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: input.canPublish,
    canSubscribe: input.canSubscribe,
    canPublishData: false,
  });
  return {
    token: await token.toJwt(),
    serverUrl: configuration.serverUrl,
    roomName,
    participant: { identity: input.identity, name: input.name },
  };
}
