import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const cutCloudDispatchBodySchema = z.object({
  jobId: z.string().uuid(),
}).strict();

export type CutCloudDispatchBody = z.infer<typeof cutCloudDispatchBodySchema>;

export type CutCloudDispatchEnvelope = {
  issuedAt: string;
  nonce: string;
  signature: string;
};

const noncePattern = /^[A-Za-z0-9_-]{24,96}$/;
const signaturePattern = /^[a-f0-9]{64}$/;

function canonicalDispatch(body: CutCloudDispatchBody, envelope: Pick<CutCloudDispatchEnvelope, "issuedAt" | "nonce">) {
  return `${envelope.issuedAt}.${envelope.nonce}.${body.jobId}`;
}

export function signCutCloudDispatch(
  secret: string,
  body: CutCloudDispatchBody,
  now = new Date(),
): CutCloudDispatchEnvelope {
  if (secret.length < 32) throw new Error("CutStudio cloud dispatch secret must contain at least 32 characters");
  const issuedAt = now.toISOString();
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", secret).update(canonicalDispatch(body, { issuedAt, nonce })).digest("hex");
  return { issuedAt, nonce, signature };
}

export function verifyCutCloudDispatch(
  secret: string,
  body: CutCloudDispatchBody,
  envelope: CutCloudDispatchEnvelope,
  now = new Date(),
  maxAgeMs = 5 * 60_000,
) {
  if (secret.length < 32 || !noncePattern.test(envelope.nonce) || !signaturePattern.test(envelope.signature)) return false;
  const issuedAtMs = Date.parse(envelope.issuedAt);
  if (!Number.isFinite(issuedAtMs) || Math.abs(now.getTime() - issuedAtMs) > maxAgeMs) return false;
  const expected = createHmac("sha256", secret).update(canonicalDispatch(body, envelope)).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(envelope.signature, "hex"));
}

