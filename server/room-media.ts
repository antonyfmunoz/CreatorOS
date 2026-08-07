import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_INGEST_SKEW_MS = 5 * 60 * 1_000;
const MIN_INGEST_SECRET_BYTES = 32;
const MAX_TRANSCRIPT_TIME_MS = 7 * 24 * 60 * 60 * 1_000;

export const roomTranscriptSegmentInputSchema = z
  .object({
    roomId: z.string().uuid(),
    sessionId: z.string().uuid(),
    providerSegmentId: z.string().trim().min(1).max(200),
    speakerIdentity: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(10_000),
    startTimeMs: z.number().int().nonnegative().max(MAX_TRANSCRIPT_TIME_MS).nullable().optional(),
    endTimeMs: z.number().int().nonnegative().max(MAX_TRANSCRIPT_TIME_MS).nullable().optional(),
    isFinal: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      value.startTimeMs == null ||
      value.endTimeMs == null ||
      value.endTimeMs >= value.startTimeMs,
    { message: "Transcript end time must follow its start time" },
  );

export function roomMediaIngestSignature(
  secret: string,
  timestamp: string,
  rawBody: Buffer | string,
) {
  return createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(rawBody)
    .digest("hex");
}

export function configuredRoomMediaIngestSecret(
  secret: string | undefined,
) {
  return secret && Buffer.byteLength(secret, "utf8") >= MIN_INGEST_SECRET_BYTES
    ? secret
    : null;
}

export function verifyRoomMediaIngest(input: {
  secret: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer | string;
  now?: number;
}) {
  const { secret, timestamp, signature, rawBody } = input;
  const configuredSecret = configuredRoomMediaIngestSecret(secret);
  if (!configuredSecret || !timestamp || !signature || !/^\d{13}$/.test(timestamp))
    return false;
  const now = input.now ?? Date.now();
  if (Math.abs(now - Number(timestamp)) > MAX_INGEST_SKEW_MS) return false;
  const expected = roomMediaIngestSignature(configuredSecret, timestamp, rawBody);
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export function missingParticipantConsentUserIds(
  participantUserIds: readonly number[],
  grantedUserIds: readonly number[],
) {
  const granted = new Set(grantedUserIds);
  return Array.from(new Set(participantUserIds)).filter(
    (userId) => !granted.has(userId),
  );
}
