import { and, inArray, notInArray, sql } from "drizzle-orm";
import {
  communityRoomAgentSessions,
  communityRoomIntelligencePolicies,
  communityRoomRecordings,
  communityRoomTranscriptSegments,
} from "../shared/schema";
import { db } from "./db";
import { removeStoredAsset } from "./asset-storage";

const TERMINAL_RECORDING_STATUSES = ["complete", "failed", "aborted"];
const ACTIVE_AGENT_STATUSES = ["starting", "active"];

const pastRetention = (createdAt: unknown, retentionDays: unknown) =>
  sql`${createdAt} < now() - (coalesce(${retentionDays}, 30) * interval '1 day')`;

export async function cleanupExpiredRoomMedia() {
  const expiredRecordings = await db
    .select({
      id: communityRoomRecordings.id,
      storageKey: communityRoomRecordings.storageKey,
    })
    .from(communityRoomRecordings)
    .leftJoin(
      communityRoomIntelligencePolicies,
      sql`${communityRoomIntelligencePolicies.roomId} = ${communityRoomRecordings.roomId}`,
    )
    .where(
      and(
        inArray(communityRoomRecordings.status, TERMINAL_RECORDING_STATUSES),
        pastRetention(
          communityRoomRecordings.createdAt,
          communityRoomIntelligencePolicies.retentionDays,
        ),
      ),
    )
    .limit(250);

  let recordingsDeleted = 0;
  for (const recording of expiredRecordings) {
    try {
      await removeStoredAsset(recording.storageKey, "private");
      await db
        .delete(communityRoomRecordings)
        .where(sql`${communityRoomRecordings.id} = ${recording.id}`);
      recordingsDeleted += 1;
    } catch (error) {
      console.error("Could not delete expired room recording:", error);
    }
  }

  const expiredSegments = await db
    .select({ id: communityRoomTranscriptSegments.id })
    .from(communityRoomTranscriptSegments)
    .leftJoin(
      communityRoomIntelligencePolicies,
      sql`${communityRoomIntelligencePolicies.roomId} = ${communityRoomTranscriptSegments.roomId}`,
    )
    .where(
      pastRetention(
        communityRoomTranscriptSegments.createdAt,
        communityRoomIntelligencePolicies.retentionDays,
      ),
    )
    .limit(2_000);
  if (expiredSegments.length)
    await db.delete(communityRoomTranscriptSegments).where(
      inArray(
        communityRoomTranscriptSegments.id,
        expiredSegments.map((segment) => segment.id),
      ),
    );

  const expiredSessions = await db
    .select({ id: communityRoomAgentSessions.id })
    .from(communityRoomAgentSessions)
    .leftJoin(
      communityRoomIntelligencePolicies,
      sql`${communityRoomIntelligencePolicies.roomId} = ${communityRoomAgentSessions.roomId}`,
    )
    .where(
      and(
        notInArray(communityRoomAgentSessions.status, ACTIVE_AGENT_STATUSES),
        pastRetention(
          communityRoomAgentSessions.createdAt,
          communityRoomIntelligencePolicies.retentionDays,
        ),
      ),
    )
    .limit(1_000);
  if (expiredSessions.length)
    await db.delete(communityRoomAgentSessions).where(
      inArray(
        communityRoomAgentSessions.id,
        expiredSessions.map((session) => session.id),
      ),
    );

  return {
    recordingsDeleted,
    transcriptSegmentsDeleted: expiredSegments.length,
    agentSessionsDeleted: expiredSessions.length,
  };
}
