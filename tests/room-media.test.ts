import { describe, expect, it } from "vitest";
import {
  configuredRoomMediaIngestSecret,
  missingParticipantConsentUserIds,
  roomMediaIngestSignature,
  roomTranscriptSegmentInputSchema,
  verifyRoomMediaIngest,
} from "../server/room-media";

describe("room media security and evidence", () => {
  it("accepts a fresh signed final transcript segment", () => {
    const secret = "test-room-media-secret-with-sufficient-entropy";
    const timestamp = "1786067000000";
    const body = Buffer.from('{"roomId":"00000000-0000-4000-8000-000000000001"}');
    expect(
      verifyRoomMediaIngest({
        secret,
        timestamp,
        signature: roomMediaIngestSignature(secret, timestamp, body),
        rawBody: body,
        now: Number(timestamp),
      }),
    ).toBe(true);
  });

  it("rejects stale or modified transcript payloads", () => {
    const secret = "test-room-media-secret-with-sufficient-entropy";
    const timestamp = "1786067000000";
    const original = Buffer.from("original");
    const signature = roomMediaIngestSignature(secret, timestamp, original);
    expect(
      verifyRoomMediaIngest({
        secret,
        timestamp,
        signature,
        rawBody: Buffer.from("modified"),
        now: Number(timestamp),
      }),
    ).toBe(false);
    expect(
      verifyRoomMediaIngest({
        secret,
        timestamp,
        signature,
        rawBody: original,
        now: Number(timestamp) + 6 * 60 * 1_000,
      }),
    ).toBe(false);
  });

  it("fails closed when the transcript signing secret is weak", () => {
    expect(configuredRoomMediaIngestSecret("too-short")).toBeNull();
    expect(
      verifyRoomMediaIngest({
        secret: "too-short",
        timestamp: "1786067000000",
        signature: "0".repeat(64),
        rawBody: "{}",
        now: 1786067000000,
      }),
    ).toBe(false);
  });

  it("stores only finalized, bounded transcript evidence", () => {
    expect(
      roomTranscriptSegmentInputSchema.safeParse({
        roomId: "00000000-0000-4000-8000-000000000001",
        sessionId: "00000000-0000-4000-8000-000000000002",
        providerSegmentId: "segment-1",
        speakerIdentity: "creativesos-user-7",
        text: "A final statement",
        startTimeMs: 500,
        endTimeMs: 900,
        isFinal: true,
      }).success,
    ).toBe(true);
    expect(
      roomTranscriptSegmentInputSchema.safeParse({
        roomId: "00000000-0000-4000-8000-000000000001",
        sessionId: "00000000-0000-4000-8000-000000000002",
        providerSegmentId: "segment-1",
        speakerIdentity: "creativesos-user-7",
        text: "Interim statement",
        isFinal: false,
      }).success,
    ).toBe(false);
    expect(
      roomTranscriptSegmentInputSchema.safeParse({
        roomId: "00000000-0000-4000-8000-000000000001",
        providerSegmentId: "segment-without-session",
        speakerIdentity: "creativesos-user-7",
        text: "Missing lineage",
        isFinal: true,
      }).success,
    ).toBe(false);
  });

  it("blocks activation until every current participant has consented", () => {
    expect(missingParticipantConsentUserIds([7, 8, 8], [7])).toEqual([8]);
    expect(missingParticipantConsentUserIds([7, 8], [8, 7])).toEqual([]);
  });
});
