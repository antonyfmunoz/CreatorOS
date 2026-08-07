import crypto from "node:crypto";

/**
 * Signs the exact bytes transported between a UMH control plane and a
 * projection adapter. Timestamp and nonce are part of the authenticated data.
 */
export function createUmhSignature(secret: string, timestamp: string, nonce: string, body: Buffer | string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${nonce}.`).update(body).digest("hex");
}

export function verifyUmhSignature(secret: string, timestamp: string, nonce: string, body: Buffer | string, presentedSignature: string) {
  const expected = Buffer.from(createUmhSignature(secret, timestamp, nonce, body), "utf8");
  const presented = Buffer.from(presentedSignature, "utf8");
  return presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
}
