import { describe, expect, it } from "vitest";
import {
  broadcastLiveKitRoomName,
  createBroadcastLiveKitToken,
  createLiveKitParticipantToken,
  getLiveKitRecordingConfiguration,
  hasLiveKitPublishedMediaTrack,
  getLiveKitConfiguration,
  liveKitApiUrl,
  liveKitProviderStatus,
  liveKitRecordingResult,
  liveKitRoomName,
  liveKitUserIdFromIdentity,
} from "../server/livekit";
import { EgressInfo, EgressStatus, TrackType } from "livekit-server-sdk";

function decodeJwtPayload(token: string) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

describe("LiveKit community-room integration", () => {
  it("fails closed until all provider settings exist", () => {
    expect(liveKitProviderStatus({})).toEqual({
      configured: false,
      recordingConfigured: false,
      transcriptionAgentConfigured: false,
      roomAgentConfigured: false,
    });
    expect(
      getLiveKitConfiguration({
        LIVEKIT_URL: "wss://example.livekit.cloud",
        LIVEKIT_API_KEY: "key",
      }),
    ).toBeNull();
    expect(
      getLiveKitConfiguration({
        LIVEKIT_URL: "https://not-a-websocket.example",
        LIVEKIT_API_KEY: "key",
        LIVEKIT_API_SECRET: "secret",
      }),
    ).toBeNull();
  });

  it("requires both LiveKit and private R2 before recording", () => {
    expect(
      getLiveKitRecordingConfiguration({
        LIVEKIT_URL: "wss://example.livekit.cloud",
        LIVEKIT_API_KEY: "key",
        LIVEKIT_API_SECRET: "secret",
      }),
    ).toBeNull();
    expect(
      getLiveKitRecordingConfiguration({
        LIVEKIT_URL: "wss://example.livekit.cloud",
        LIVEKIT_API_KEY: "key",
        LIVEKIT_API_SECRET: "secret",
        R2_ACCOUNT_ID: "account",
        R2_ACCESS_KEY_ID: "access",
        R2_SECRET_ACCESS_KEY: "r2-secret",
        R2_PRIVATE_BUCKET_NAME: "private",
      }),
    ).toMatchObject({ r2PrivateBucketName: "private" });
    expect(liveKitApiUrl("wss://example.livekit.cloud")).toBe(
      "https://example.livekit.cloud",
    );
  });

  it("parses only first-party human participant identities", () => {
    expect(liveKitUserIdFromIdentity("creativesos-user-42")).toBe(42);
    expect(liveKitUserIdFromIdentity("creativesos-agent-coach")).toBeNull();
    expect(liveKitUserIdFromIdentity("creativesos-user-nope")).toBeNull();
  });

  it("requires an unmuted audio or video track before room recording", () => {
    expect(hasLiveKitPublishedMediaTrack([{ tracks: [] } as never])).toBe(false);
    expect(
      hasLiveKitPublishedMediaTrack([
        { tracks: [{ type: TrackType.AUDIO, muted: true }] } as never,
      ]),
    ).toBe(false);
    expect(
      hasLiveKitPublishedMediaTrack([
        { tracks: [{ type: TrackType.VIDEO, muted: false }] } as never,
      ]),
    ).toBe(true);
  });

  it("normalizes completed egress evidence", () => {
    const info = new EgressInfo({
      egressId: "egress-1",
      status: EgressStatus.EGRESS_COMPLETE,
      startedAt: BigInt("1786067000000000000"),
      endedAt: BigInt("1786067060000000000"),
      fileResults: [
        {
          filename: "room.mp4",
          duration: BigInt("60000000000"),
          size: BigInt("123456"),
        } as never,
      ],
      details: "End reason: StopEgress API",
    });
    expect(liveKitRecordingResult(info)).toMatchObject({
      providerRecordingId: "egress-1",
      status: "complete",
      durationMs: 60_000,
      sizeBytes: 123_456,
      errorMessage: null,
    });
  });

  it("normalizes the legacy single-file result returned by LiveKit Cloud", () => {
    const info = new EgressInfo({
      egressId: "egress-legacy",
      status: EgressStatus.EGRESS_COMPLETE,
      result: {
        case: "file",
        value: {
          filename: "room.mp4",
          duration: BigInt("48742833226"),
          size: BigInt("885822"),
        },
      },
    });
    expect(liveKitRecordingResult(info)).toMatchObject({
      status: "complete",
      durationMs: 48_742,
      sizeBytes: 885_822,
      errorMessage: null,
    });
  });

  it("issues a short-lived, room-scoped publishing token", async () => {
    const result = await createLiveKitParticipantToken(
      {
        serverUrl: "wss://example.livekit.cloud",
        apiKey: "test-api-key",
        apiSecret: "test-api-secret-with-enough-entropy",
      },
      {
        roomId: "room-123",
        communityId: 42,
        userId: 7,
        displayName: "Creative Member",
        role: "member",
        canPublish: true,
      },
    );
    const payload = decodeJwtPayload(result.token);
    expect(result.roomName).toBe(liveKitRoomName(42, "room-123"));
    expect(result.participant.identity).toBe("creativesos-user-7");
    expect(payload.video).toMatchObject({
      room: "creativesos-community-42-room-room-123",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    expect(payload.exp - payload.nbf).toBeLessThanOrEqual(15 * 60);
  });

  it("makes muted members listen-only", async () => {
    const result = await createLiveKitParticipantToken(
      {
        serverUrl: "wss://example.livekit.cloud",
        apiKey: "test-api-key",
        apiSecret: "test-api-secret-with-enough-entropy",
      },
      {
        roomId: "room-456",
        communityId: 42,
        userId: 8,
        displayName: "Read-only Member",
        role: "member",
        canPublish: false,
      },
    );
    expect(decodeJwtPayload(result.token).video).toMatchObject({
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
      canPublishData: false,
    });
  });

  it("isolates Broadcast field publishers from operator subscribers", async () => {
    const configuration = { serverUrl: "wss://example.livekit.cloud", apiKey: "test-api-key", apiSecret: "test-api-secret-with-enough-entropy" };
    const field = await createBroadcastLiveKitToken(configuration, { studioId: "studio-123", identity: "capture-node-node-123", name: "Phone camera", role: "field_camera", canPublish: true, canSubscribe: false });
    const operator = await createBroadcastLiveKitToken(configuration, { studioId: "studio-123", identity: "broadcast-operator-7", name: "Operator", role: "operator", canPublish: false, canSubscribe: true });
    expect(field.roomName).toBe(broadcastLiveKitRoomName("studio-123"));
    expect(decodeJwtPayload(field.token).video).toMatchObject({ roomJoin: true, canPublish: true, canSubscribe: false, canPublishData: false });
    expect(decodeJwtPayload(operator.token).video).toMatchObject({ roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: false });
  });
});
