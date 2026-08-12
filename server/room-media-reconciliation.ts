import {
  and,
  count,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
} from "drizzle-orm";
import {
  communityRoomAgentSessions,
  communityRoomRecordings,
  communityRooms,
  type CommunityRoomRecording,
} from "../shared/schema";
import { db } from "./db";
import {
  getLiveKitConfiguration,
  getLiveKitRoomRecording,
  liveKitRecordingResult,
} from "./livekit";

const ACTIVE_RECORDING_STATUSES = ["starting", "active", "stopping"];
const TERMINAL_RECORDING_STATUSES = new Set(["complete", "failed", "aborted"]);
const STALE_START_MS = 10 * 60 * 1_000;

export async function reconcileRoomRecording(
  recording: CommunityRoomRecording,
) {
  const configuration = getLiveKitConfiguration();
  const needsCompletedFileMetadata =
    recording.status === "complete" &&
    (recording.durationMs === null || recording.sizeBytes === null);
  if (
    !configuration ||
    !recording.providerRecordingId ||
    (!needsCompletedFileMetadata &&
      !ACTIVE_RECORDING_STATUSES.includes(recording.status))
  )
    return recording;

  try {
    const providerRecording = await getLiveKitRoomRecording(
      configuration,
      recording.providerRecordingId,
    );
    if (!providerRecording) return recording;
    const result = liveKitRecordingResult(providerRecording);
    const [updated] = await db
      .update(communityRoomRecordings)
      .set({ ...result, updatedAt: new Date() })
      .where(eq(communityRoomRecordings.id, recording.id))
      .returning();
    if (TERMINAL_RECORDING_STATUSES.has(updated.status))
      await db
        .update(communityRooms)
        .set({ recordingEnabled: false, updatedAt: new Date() })
        .where(eq(communityRooms.id, recording.roomId));
    return updated;
  } catch (error) {
    console.error("Could not reconcile LiveKit recording:", error);
    return recording;
  }
}

async function clearRoomAgentFlagWhenInactive(
  roomId: string,
  kind: string,
  excludedSessionId: string,
) {
  const [otherActive] = await db
    .select({ count: count(communityRoomAgentSessions.id) })
    .from(communityRoomAgentSessions)
    .where(
      and(
        eq(communityRoomAgentSessions.roomId, roomId),
        eq(communityRoomAgentSessions.kind, kind),
        ne(communityRoomAgentSessions.id, excludedSessionId),
        inArray(communityRoomAgentSessions.status, ["starting", "active"]),
      ),
    );
  if (Number(otherActive?.count ?? 0) > 0) return;
  await db
    .update(communityRooms)
    .set({
      ...(kind === "transcription"
        ? { transcriptionEnabled: false }
        : { aiAssistanceEnabled: false }),
      updatedAt: new Date(),
    })
    .where(eq(communityRooms.id, roomId));
}

export async function reconcileRoomMediaRuntime(now = new Date()) {
  const candidates = await db
    .select()
    .from(communityRoomRecordings)
    .where(
      or(
        inArray(communityRoomRecordings.status, ACTIVE_RECORDING_STATUSES),
        and(
          eq(communityRoomRecordings.status, "complete"),
          or(
            isNull(communityRoomRecordings.durationMs),
            isNull(communityRoomRecordings.sizeBytes),
          ),
        ),
      ),
    )
    .limit(100);

  let recordingsReconciled = 0;
  let staleRecordingsFailed = 0;
  const staleCutoff = new Date(now.getTime() - STALE_START_MS);
  for (const recording of candidates) {
    if (
      recording.status === "starting" &&
      !recording.providerRecordingId &&
      recording.createdAt < staleCutoff
    ) {
      await db
        .update(communityRoomRecordings)
        .set({
          status: "failed",
          errorMessage: "Provider start was not confirmed before recovery timeout",
          stoppedAt: now,
          updatedAt: now,
        })
        .where(eq(communityRoomRecordings.id, recording.id));
      await db
        .update(communityRooms)
        .set({ recordingEnabled: false, updatedAt: now })
        .where(eq(communityRooms.id, recording.roomId));
      staleRecordingsFailed += 1;
      continue;
    }
    const updated = await reconcileRoomRecording(recording);
    if (updated.updatedAt.getTime() !== recording.updatedAt.getTime())
      recordingsReconciled += 1;
  }

  const staleAgentSessions = await db
    .update(communityRoomAgentSessions)
    .set({
      status: "failed",
      errorMessage: "Provider dispatch was not confirmed before recovery timeout",
      stoppedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(communityRoomAgentSessions.status, "starting"),
        isNull(communityRoomAgentSessions.providerSessionId),
        lt(communityRoomAgentSessions.createdAt, staleCutoff),
      ),
    )
    .returning({
      id: communityRoomAgentSessions.id,
      roomId: communityRoomAgentSessions.roomId,
      kind: communityRoomAgentSessions.kind,
    });
  for (const session of staleAgentSessions)
    await clearRoomAgentFlagWhenInactive(
      session.roomId,
      session.kind,
      session.id,
    );

  return {
    recordingsReconciled,
    staleRecordingsFailed,
    staleAgentSessionsFailed: staleAgentSessions.length,
  };
}
